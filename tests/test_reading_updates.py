import argparse
import io
import json
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'scripts'))
import update_readings as updates

SOURCE = json.loads((updates.ROOT / 'config/reading-sources.json').read_text())['sources'][0]


class ReadingUpdateTests(unittest.TestCase):
    def test_whitelist_rejects_other_shows_domains_and_credentials(self):
        self.assertTrue(updates.approved(SOURCE['list_url'] + '/tse-1.html', SOURCE))
        for url in [
            'https://www.tagesschau.de/tagesschau_20_uhr/ts-1.html',
            'http://www.tagesschau.de/tagesschau_in_einfacher_sprache/tse-1.html',
            'https://www.tagesschau.de.evil.test/tagesschau_in_einfacher_sprache/a',
            'https://user:pass@www.tagesschau.de/tagesschau_in_einfacher_sprache/a',
            'https://www.tagesschau.de:444/tagesschau_in_einfacher_sprache/a',
        ]:
            with self.subTest(url=url):
                self.assertFalse(updates.approved(url, SOURCE))

    def test_redirect_is_checked_before_requesting_new_location(self):
        handler = updates.ApprovedRedirect(lambda url: updates.approved(url, SOURCE))
        with self.assertRaises(ValueError):
            handler.redirect_request(Request(SOURCE['list_url']), None, 302, '', {}, 'https://example.com/a')

    FIELDS = {'date': '2026-10-20', 'synopsis': 'Ideen', 'episode_url': SOURCE['list_url'] + '/tse-1.html',
              'video_page': SOURCE['list_url'] + '/video-1.html', 'text_sha256': 'a' * 64}

    @staticmethod
    def ai_reply(payload):
        return io.BytesIO(json.dumps({'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps(payload)}}]}).encode())

    def test_broadcast_text_and_timing_come_from_subtitles_not_the_model(self):
        cues = [{'start': 1, 'end': 2, 'text': '* Gong *'},
                {'start': 3.111, 'end': 4, 'text': 'Willkommen zur'}, {'start': 4.2, 'end': 5.555, 'text': 'tagesschau.'},
                {'start': 6, 'end': 7, 'text': 'Wir lernen neue Wörter.'},
                {'start': 8, 'end': 9, 'text': 'Tschüss.'}, {'start': 10, 'end': 11, 'text': 'Copyright Untertitel: NDR'}]
        reply = {'zh': ['欢迎收看每日新闻。', '我们学习新单词。', '再见。'],
                 'stories': [{'title': 'Begrüßung', 'title_zh': '欢迎', 'from': 0, 'to': 0},
                             {'title': 'Wörter', 'title_zh': '单词', 'from': 1, 'to': 1, 'extra': 'dropped',
                              'vocab': [{'lemma': 'das Wort, Wörter', 'forms': ['Wörter'], 'pos': 'Substantiv', 'zh': '词', 'sentence': 1}],
                              'grammar_points': [{'title': '现在时', 'summary': '动词第二位。', 'sentence': 1}]},
                             {'title': 'Abschied', 'title_zh': '结束语', 'from': 2, 'to': 2}],
                 # Anything the model says about German text is ignored.
                 'sentences': [{'de': 'Erfunden.'}]}
        with patch.dict(updates.os.environ, {'GLM_API_KEY': 'unit-test-placeholder'}), \
                patch.object(updates.urllib.request, 'urlopen', return_value=self.ai_reply(reply)) as call:
            doc = updates.generate(self.FIELDS, cues)
        self.assertEqual(call.call_count, 1)
        self.assertEqual([s['de'] for s in doc['sentences']], ['Willkommen zur tagesschau.', 'Wir lernen neue Wörter.', 'Tschüss.'])
        self.assertEqual(doc['sentences'][0], {'de': 'Willkommen zur tagesschau.', 'start': 3.11, 'end': 5.55, 'zh': '欢迎收看每日新闻。'})
        self.assertEqual(doc['sentences'][1]['zh'], '我们学习新单词。')
        self.assertEqual((doc['content_kind'], doc['schema']), ('broadcast', 2))
        self.assertEqual(doc['stories'][1]['vocab'][0]['key'], 'wort')
        self.assertNotIn('extra', doc['stories'][1])
        self.assertEqual(doc['video_page'], self.FIELDS['video_page'])
        updates.validate(doc)

    def test_translation_that_never_fills_every_sentence_is_rejected(self):
        cues = [{'start': i, 'end': i + 0.5, 'text': f'Satz {i}.'} for i in range(4)]
        # A 3-item list for 4 sentences can't be aligned, so it is discarded and re-asked; it never completes.
        reply = {'zh': ['一', '二', '三'], 'stories': [{'title': 'A', 'title_zh': '甲', 'from': 0, 'to': 3}]}
        with patch.dict(updates.os.environ, {'GLM_API_KEY': 'unit-test-placeholder'}), \
                patch.object(updates.urllib.request, 'urlopen', side_effect=lambda *a, **k: self.ai_reply(reply)) as call:
            with self.assertRaisesRegex(ValueError, '4 of 4 sentences still untranslated'):
                updates.generate(self.FIELDS, cues)
        self.assertEqual(call.call_count, 4)  # combined call + 3 refill rounds

    def test_missing_translations_are_refilled_without_regenerating_the_day(self):
        cues = [{'start': i, 'end': i + 0.5, 'text': f'Satz {i}.'} for i in range(4)]
        first = {'zh': {'0': '第零句。', '1': '第一句。', '3': '第三句。', '9': '多余'},
                 'stories': [{'title': 'A', 'title_zh': '甲', 'from': 0, 'to': 3}]}
        asked = []

        def fake_urlopen(req, timeout):
            body = json.loads(json.loads(req.data)['messages'][1]['content'])
            asked.append([x['i'] for x in body['sentences']])
            return self.ai_reply(first if len(asked) == 1 else {'zh': {'2': '第二句。'}})

        with patch.dict(updates.os.environ, {'GLM_API_KEY': 'unit-test-placeholder'}), \
                patch.object(updates.urllib.request, 'urlopen', side_effect=fake_urlopen):
            doc = updates.generate(self.FIELDS, cues)
        self.assertEqual(asked, [[0, 1, 2, 3], [2]])
        self.assertEqual([x['zh'] for x in doc['sentences']], ['第零句。', '第一句。', '第二句。', '第三句。'])

    def test_misplaced_vocab_is_repointed_or_dropped_instead_of_failing_the_day(self):
        sentences = [{'de': 'Guten Abend.'}, {'de': 'Die Regierung plant ein Gesetz.'}, {'de': 'Das Gesetz kommt bald.'}]
        stories = [{'title': 'A', 'title_zh': '甲', 'from': 0, 'to': 0, 'vocab': [], 'grammar_points': []},
                   {'title': 'B', 'title_zh': '乙', 'from': 1, 'to': 2, 'grammar_points': [{'title': 'g', 'summary': 's', 'sentence': 0}],
                    'vocab': [{'lemma': 'das Gesetz, -e', 'key': 'gesetz', 'forms': ['Gesetz'], 'pos': 'S', 'zh': '法律', 'sentence': 0},
                              {'lemma': 'bald', 'key': 'bald', 'forms': ['bald', 'demnächst'], 'pos': 'A', 'zh': '很快', 'sentence': 1},
                              {'lemma': 'die Wahl, -en', 'key': 'wahl', 'forms': ['Wahl'], 'pos': 'S', 'zh': '选举', 'sentence': 1}]}]
        out = updates.repair_stories(stories, sentences)[1]
        self.assertEqual([(v['key'], v['sentence'], v['forms']) for v in out['vocab']], [('gesetz', 1, ['Gesetz']), ('bald', 2, ['bald'])])
        self.assertEqual(out['grammar_points'], [])  # cited a sentence outside its story

    def test_long_broadcasts_are_translated_in_chunks(self):
        n = updates.COMBINED_LIMIT + 31
        cues = [{'start': i, 'end': i + 0.5, 'text': f'Das ist Satz {i}.'} for i in range(n)]
        seen = []

        def fake_urlopen(req, timeout):
            body = json.loads(json.loads(req.data)['messages'][1]['content'])
            idx = [x['i'] for x in body['sentences']]
            seen.append((idx[0], idx[-1]))
            if 'stories' in json.loads(req.data)['messages'][0]['content'].split('Return ONLY JSON')[-1]:
                return self.ai_reply({'stories': [{'title': 'Alles', 'title_zh': '全部', 'from': 0, 'to': n - 1}]})
            return self.ai_reply({'zh': [f'句子{i}' for i in idx]})

        with patch.dict(updates.os.environ, {'GLM_API_KEY': 'unit-test-placeholder'}), \
                patch.object(updates.urllib.request, 'urlopen', side_effect=fake_urlopen):
            doc = updates.generate(self.FIELDS, cues)
        self.assertEqual(seen, [(0, 59), (60, 119), (120, n - 1), (0, n - 1)])
        self.assertEqual(doc['sentences'][75]['zh'], '句子75')
        self.assertEqual(len(doc['sentences']), n)
        updates.validate(doc)

    def test_failed_generation_does_not_replace_existing_content_or_publish(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'config').mkdir()
            (root / 'config/reading-sources.json').write_text(json.dumps({'sources': [SOURCE]}))
            original = {'date': '2026-10-20', 'source_text_sha256': 'old', 'news': ['previous valid content']}
            path = root / 'data/content/2026-10-20.json'
            updates.atomic_json(path, original)
            fields = {'date': '2026-10-20', 'text_sha256': 'new'}
            args = argparse.Namespace(env_file=None, since=date(2026, 10, 14), until=date(2026, 10, 20), fetch_only=False, publish=True)
            with patch.object(updates, 'ROOT', root), patch.object(updates, 'discover', return_value=[(fields, b'<source/>')]), patch.object(updates, 'ebu_to_cues', return_value=[]), patch.object(updates, 'generate', return_value={'date': '2026-10-20'}), patch.object(updates, 'validate', side_effect=ValueError('bad translation')), patch.object(updates.subprocess, 'run') as publish:
                with self.assertRaisesRegex(updates.PartialUpdate, 'bad translation') as caught:
                    updates.update(args)
            self.assertEqual(json.loads(path.read_text()), original)
            publish.assert_not_called()
            self.assertEqual(caught.exception.ready, [])
            self.assertEqual([day for day, _ in caught.exception.failures], ['2026-10-20'])

    def test_one_failed_day_does_not_block_the_other_days(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'config').mkdir()
            (root / 'config/reading-sources.json').write_text(json.dumps({'sources': [SOURCE]}))
            original = {'date': '2026-10-19', 'source_text_sha256': 'old', 'news': ['previous valid content']}
            bad_path = root / 'data/content/2026-10-19.json'
            updates.atomic_json(bad_path, original)
            editions = [({'date': '2026-10-19', 'text_sha256': 'b' * 64}, b'<bad/>'),
                        ({'date': '2026-10-20', 'text_sha256': 'c' * 64}, b'<good/>')]

            def check(doc):
                if doc['date'] == '2026-10-19':
                    raise ValueError('bad translation')

            args = argparse.Namespace(env_file=None, since=date(2026, 10, 14), until=date(2026, 10, 20), fetch_only=False, publish=True)
            with patch.object(updates, 'ROOT', root), patch.object(updates, 'discover', return_value=editions), patch.object(updates, 'ebu_to_cues', return_value=[]), patch.object(updates, 'generate', side_effect=lambda fields, cues, feedback='': {'date': fields['date']}), patch.object(updates, 'validate', side_effect=check), patch.object(updates.subprocess, 'run') as publish:
                with self.assertRaises(updates.PartialUpdate) as caught:
                    updates.update(args)
            self.assertEqual(json.loads(bad_path.read_text()), original)
            self.assertEqual(json.loads((root / 'data/content/2026-10-20.json').read_text()), {'date': '2026-10-20'})
            publish.assert_called_once_with(['bash', str(root / 'scripts/publish.sh'), '2026-10-20'], cwd=root, check=True)
            self.assertEqual(caught.exception.ready, ['2026-10-20'])
            self.assertEqual([day for day, _ in caught.exception.failures], ['2026-10-19'])
            self.assertIn('bad translation', str(caught.exception))

    def test_discover_skips_a_day_without_official_text(self):
        base = SOURCE['list_url'] + '/'
        index_html = b'<a href="/x/tse-1.html">Mo</a> <a href="/x/tse-2.html">Di</a>'
        pages = {base + 'tse-1.html': b'page-1', base + 'tse-2.html': b'page-2', base + 'untertitel-2.xml': b'<tt/>'}

        def fields(page, url, source):
            if page == 'page-1':
                return {'date': '2026-10-19', 'subtitle_url': '', 'synopsis': 'Wahl', 'episode_id': 'tse-1'}
            return {'date': '2026-10-20', 'subtitle_url': base + 'untertitel-2.xml', 'synopsis': 'Wahl', 'episode_id': 'tse-2'}

        failures = []
        with patch.object(updates, 'source_bytes', side_effect=lambda url, source, listing=False: index_html if listing else pages[url]), patch.object(updates, 'parse_fields', side_effect=fields), patch.object(updates, 'ebu_to_cues', return_value=[{'text': 'Wahl'}] * 8), patch.object(updates, 'transcript_matches_synopsis', return_value=True):
            editions = updates.discover(SOURCE, date(2026, 10, 14), date(2026, 10, 20), failures)
        self.assertEqual([f['date'] for f, _ in editions], ['2026-10-20'])
        self.assertEqual(failures, [('2026-10-19', 'official text is not available yet')])

    def test_unchanged_source_skips_ai_but_retries_publish(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'config').mkdir()
            (root / 'config/reading-sources.json').write_text(json.dumps({'sources': [SOURCE]}))
            fields = {'date': '2026-10-20', 'text_sha256': 'a' * 64}
            doc = {'date': '2026-10-20', 'content_kind': 'broadcast', 'source_text_sha256': 'a' * 64}
            updates.atomic_json(root / 'data/content/2026-10-20.json', doc)
            args = argparse.Namespace(env_file=None, since=None, until=date(2026, 10, 20), fetch_only=False, publish=True)
            with patch.object(updates, 'ROOT', root), patch.object(updates, 'discover', return_value=[(fields, b'<source/>')]), patch.object(updates, 'ebu_to_cues', return_value=[]), patch.object(updates, 'validate'), patch.object(updates, 'generate') as generate, patch.object(updates.subprocess, 'run') as publish:
                self.assertEqual(updates.update(args), ['2026-10-20'])
                generate.assert_not_called()
                publish.assert_called_once_with(['bash', str(root / 'scripts/publish.sh'), '2026-10-20'], cwd=root, check=True)

    def test_old_reading_is_regenerated_and_force_regenerates_broadcast(self):
        for existing, force in ((({'content_kind': 'reading'}), False), ({'content_kind': 'broadcast'}, True)):
            with self.subTest(existing=existing, force=force), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                (root / 'config').mkdir()
                (root / 'config/reading-sources.json').write_text(json.dumps({'sources': [SOURCE]}))
                updates.atomic_json(root / 'data/content/2026-10-20.json', {'date': '2026-10-20', 'source_text_sha256': 'a' * 64, **existing})
                fields = {'date': '2026-10-20', 'text_sha256': 'a' * 64}
                args = argparse.Namespace(env_file=None, since=None, until=date(2026, 10, 20), fetch_only=False, publish=False, force=force)
                new = {'date': '2026-10-20', 'content_kind': 'broadcast', 'source_text_sha256': 'a' * 64, 'fresh': True}
                with patch.object(updates, 'ROOT', root), patch.object(updates, 'discover', return_value=[(fields, b'<source/>')]), patch.object(updates, 'ebu_to_cues', return_value=[]), patch.object(updates, 'validate'), patch.object(updates, 'generate', return_value=new) as generate, patch.object(updates.subprocess, 'run'):
                    self.assertEqual(updates.update(args), ['2026-10-20'])
                generate.assert_called_once()
                self.assertTrue(json.loads((root / 'data/content/2026-10-20.json').read_text())['fresh'])

if __name__ == '__main__':
    unittest.main()

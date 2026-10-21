import argparse
import copy
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
import build

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

    def test_generated_examples_are_derived_from_sentence_pairs(self):
        news = [{
            'title': 'Neue Ideen', 'title_zh': '新想法',
            'sentences': [{'de': 'Wir lesen heute Nachrichten.', 'zh': '我们今天读新闻。'},
                          {'de': 'Die Sätze sind kurz.', 'zh': '这些句子很短。'},
                          {'de': 'Wir lernen neue Wörter.', 'zh': '我们学习新单词。'}],
            'vocab': [{'lemma': 'lernen', 'key': 'lernen', 'forms': ['lernen'], 'pos': 'Verb', 'zh': '学习', 'sentence': 2}],
            'grammar_points': [{'title': '陈述句', 'summary': '动词第二位。', 'sentence': 1}],
        }]
        response = {'choices': [{'finish_reason': 'stop', 'message': {'content': json.dumps({'news': news})}}]}
        fields = {'date': '2026-10-20', 'synopsis': 'Ideen', 'episode_url': SOURCE['list_url'] + '/tse-1.html', 'text_sha256': 'a' * 64}
        with patch.dict(updates.os.environ, {'GLM_API_KEY': 'unit-test-placeholder'}), patch.object(updates.urllib.request, 'urlopen', return_value=io.BytesIO(json.dumps(response).encode())):
            result = updates.generate(fields, [{'text': 'source'}])
        item = result['news'][0]
        self.assertEqual(item['vocab'][0]['example_de'], item['paragraphs'][2])
        self.assertEqual(item['vocab'][0]['example_zh'], item['translations'][2])
        self.assertEqual(item['grammar_points'][0]['example_de'], item['paragraphs'][1])
        self.assertNotIn('sentences', item)
        self.assertEqual(result['content_kind'], 'reading')

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
                with self.assertRaisesRegex(ValueError, 'bad translation'):
                    updates.update(args)
            self.assertEqual(json.loads(path.read_text()), original)
            publish.assert_not_called()

    def test_unchanged_source_skips_ai_but_retries_publish(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / 'config').mkdir()
            (root / 'config/reading-sources.json').write_text(json.dumps({'sources': [SOURCE]}))
            fields = {'date': '2026-10-20', 'text_sha256': 'a' * 64}
            doc = {'date': '2026-10-20', 'source_text_sha256': 'a' * 64}
            updates.atomic_json(root / 'data/content/2026-10-20.json', doc)
            args = argparse.Namespace(env_file=None, since=None, until=date(2026, 10, 20), fetch_only=False, publish=True)
            with patch.object(updates, 'ROOT', root), patch.object(updates, 'discover', return_value=[(fields, b'<source/>')]), patch.object(updates, 'ebu_to_cues', return_value=[]), patch.object(updates, 'validate'), patch.object(updates, 'generate') as generate, patch.object(updates.subprocess, 'run') as publish:
                self.assertEqual(updates.update(args), ['2026-10-20'])
                generate.assert_not_called()
                publish.assert_called_once_with(['bash', str(root / 'scripts/publish.sh'), '2026-10-20'], cwd=root, check=True)

    def test_reading_never_receives_subtitle_seek_times_or_video(self):
        doc = json.loads((updates.ROOT / 'data/content/2026-10-14.json').read_text())
        with patch.object(build, 'load_transcript') as transcript:
            html = build.render(copy.deepcopy(doc))
        transcript.assert_not_called()
        payload = json.loads(html.split('const DATA = ', 1)[1].split(';\n', 1)[0])
        self.assertEqual(payload['mp4_url'], '')
        self.assertEqual(payload['source_url'], doc['source_url'])
        self.assertTrue(all(line['start'] is None for n in payload['news'] for p in n['paras'] for line in p['lines']))


if __name__ == '__main__':
    unittest.main()

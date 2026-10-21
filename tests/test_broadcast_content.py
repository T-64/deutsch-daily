import contextlib
import copy
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / 'scripts'))
from subtitle_sentences import cue_sentences

spec = importlib.util.spec_from_file_location('content_validator', ROOT / 'scripts/validate-content.py')
validator = importlib.util.module_from_spec(spec)
spec.loader.exec_module(validator)

VALID = {
    'schema': 2, 'content_kind': 'broadcast', 'date': '2026-10-20', 'slug': '2026-10-20', 'source': 'einfach',
    'source_label': 'tagesschau in Einfacher Sprache', 'level': 'A2–B1',
    'source_url': 'https://www.tagesschau.de/tagesschau_in_einfacher_sprache/tse-1478.html',
    'video_page': 'https://www.tagesschau.de/tagesschau_in_einfacher_sprache/video-166955.html',
    'source_text_sha256': 'b' * 64, 'generated_at': '2026-10-21T07:00:00+02:00', 'generation_model': 'test',
    'sentences': [
        {'de': 'Willkommen zur tagesschau in Einfacher Sprache.', 'zh': '欢迎收看简易德语新闻。', 'start': 11.49, 'end': 14.97},
        {'de': 'In Berlin gab es ein großes Treffen.', 'zh': '柏林举行了一次大型会议。', 'start': 40.0, 'end': 43.2},
        {'de': 'Die Bundesregierung hat Investoren eingeladen.', 'zh': '联邦政府邀请了投资者。', 'start': 43.5, 'end': 46.0},
        {'de': 'Tschüss und bis zum nächsten Mal.', 'zh': '再见，下次见。', 'start': 634.09, 'end': 636.45},
    ],
    'stories': [
        {'title': 'Begrüßung', 'title_zh': '欢迎', 'from': 0, 'to': 0, 'vocab': [], 'grammar_points': []},
        {'title': 'Treffen für Investoren', 'title_zh': '投资者会议', 'from': 1, 'to': 2,
         'vocab': [{'lemma': 'das Treffen, -', 'key': 'treffen', 'forms': ['Treffen'], 'pos': 'Substantiv', 'zh': '会面', 'sentence': 1}],
         'grammar_points': [{'title': '现在完成时', 'summary': 'hat + 过去分词。', 'sentence': 2}]},
        {'title': 'Abschied', 'title_zh': '结束语', 'from': 3, 'to': 3, 'vocab': [], 'grammar_points': []},
    ],
}


def check(doc):
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / f"{doc.get('date', 'x')}.json"
        path.write_text(json.dumps(doc, ensure_ascii=False))
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            status = validator.main(['validate-content.py', str(path)])
    return status, out.getvalue()


class CueSentenceTests(unittest.TestCase):
    def test_merges_cues_and_drops_credits(self):
        cues = [
            {'start': 3.89, 'end': 4.89, 'text': '* Gong *'},
            {'start': 5, 'end': 6, 'text': 'Untertitel:\n   Norddeutscher Rundfunk 2026'},
            {'start': 11.494, 'end': 13, 'text': 'Willkommen zur tagesschau\n\n   in Einfacher Sprache.'},
            {'start': 40, 'end': 41, 'text': 'In Berlin gab es gerade'},
            {'start': 41.2, 'end': 43.456, 'text': 'ein großes Treffen.'},
            {'start': 44, 'end': 45, 'text': 'Er sagt: „Das ist gut.“'},
            {'start': 46, 'end': 47, 'text': 'Es geht so weiter'},
            {'start': 640, 'end': 642, 'text': 'Copyright Untertitel: NDR 2026'},
        ]
        self.assertEqual(cue_sentences(cues), [
            {'de': 'Willkommen zur tagesschau in Einfacher Sprache.', 'start': 11.49, 'end': 13.0},
            {'de': 'In Berlin gab es gerade ein großes Treffen.', 'start': 40.0, 'end': 43.46},
            {'de': 'Er sagt: „Das ist gut.“', 'start': 44.0, 'end': 45.0},
            {'de': 'Es geht so weiter', 'start': 46.0, 'end': 47.0},
        ])

    def test_skips_rows_without_usable_times(self):
        self.assertEqual(cue_sentences([{'text': 'Ohne Zeit.'}, {'start': 'x', 'text': 'Kaputt.'}]), [])

    def test_real_broadcast_has_no_credits(self):
        cues = json.loads((ROOT / 'data/transcripts/2026-10-20.json').read_text())
        sents = cue_sentences(cues)
        self.assertGreater(len(sents), 50)
        self.assertEqual(sents[0]['de'], 'Willkommen zur tagesschau in Einfacher Sprache.')
        self.assertFalse(any('Untertitel' in s['de'] or s['de'].startswith('*') for s in sents))
        self.assertTrue(all(a['start'] <= b['start'] for a, b in zip(sents, sents[1:])))


class BroadcastValidationTests(unittest.TestCase):
    def test_valid_document_passes(self):
        status, out = check(VALID)
        self.assertEqual(status, 0, out)

    def assertRejected(self, mutate, message):
        doc = copy.deepcopy(VALID)
        mutate(doc)
        status, out = check(doc)
        self.assertEqual(status, 1, out)
        self.assertIn(message, out)

    def test_missing_translation(self):
        self.assertRejected(lambda d: d['sentences'][2].update(zh=' '), 'sentences[2] missing zh')

    def test_times_must_be_ordered(self):
        self.assertRejected(lambda d: d['sentences'][1].update(start=50.0), 'sentences[1] needs numeric start <= end')
        self.assertRejected(lambda d: d['sentences'][2].update(start=1.0, end=2.0), 'starts before the previous sentence')

    def test_story_ranges_must_cover_every_sentence(self):
        self.assertRejected(lambda d: d['stories'][1].update(to=1), 'expected 2 (ranges must be contiguous)')
        self.assertRejected(lambda d: d['stories'].pop(), 'stories cover sentences 0-2, but there are 4')

    def test_vocab_form_must_occur_in_its_sentence(self):
        self.assertRejected(lambda d: d['stories'][1]['vocab'][0].update(sentence=2), 'forms must occur in sentence 2')
        self.assertRejected(lambda d: d['stories'][1]['vocab'][0].update(sentence=3), 'sentence must be an index inside 1-2')

    def test_grammar_needs_summary_and_at_most_one(self):
        self.assertRejected(lambda d: d['stories'][1]['grammar_points'][0].update(summary=''), 'grammar_points[0] missing summary')
        self.assertRejected(lambda d: d['stories'][1]['grammar_points'].append(dict(d['stories'][1]['grammar_points'][0])),
                            'grammar_points must be a list of at most 1')

    def test_source_must_be_whitelisted(self):
        self.assertRejected(lambda d: d.update(source_url='https://example.com/tse-1.html'), 'outside the active whitelist')


if __name__ == '__main__':
    unittest.main()

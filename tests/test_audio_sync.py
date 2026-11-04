import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import audio_sync  # noqa: E402
import build  # noqa: E402


def activity(n, spans):
    out = [0] * n
    for a, b in spans:
        for f in range(int(a / audio_sync.FRAME), int(b / audio_sync.FRAME)):
            out[f] = 1
    return out


class AudioSyncTests(unittest.TestCase):
    @staticmethod
    def spans():
        # irregular sentences and pauses, like real speech (a periodic pattern would be ambiguous)
        import random
        rng, t, out = random.Random(7), 5.0, []
        while t < 285:
            d = rng.uniform(1.0, 4.0)
            out.append((t, t + d))
            t += d + rng.uniform(0.3, 1.5)
        return out

    SPANS = spans.__func__()

    def test_recovers_a_constant_shift(self):
        n = int(300 / audio_sync.FRAME)
        subs = activity(n, self.SPANS)
        speech = activity(n, [(a + 2.3, b + 2.3) for a, b in self.SPANS])
        offset, agreement = audio_sync.estimate_offset(speech, subs)
        self.assertAlmostEqual(offset, 2.3, places=1)
        self.assertGreater(agreement, 0.9)

    def test_refuses_when_minutes_disagree(self):
        n = int(300 / audio_sync.FRAME)
        subs = activity(n, self.SPANS)
        # first half shifted +2 s, second half -1 s: no single offset is right
        speech = activity(n, [(a + (2 if a < 150 else -1), b + (2 if a < 150 else -1)) for a, b in self.SPANS])
        self.assertIsNone(audio_sync.estimate_offset(speech, subs))

    def test_subtitle_activity_skips_credits(self):
        cues = [{"start": 0, "end": 1, "text": "* Gong *"}, {"start": 2, "end": 3, "text": "Hallo."},
                {"start": 4, "end": 5, "text": "Copyright Untertitel: NDR"}]
        on = audio_sync.subtitle_activity(cues, int(6 / audio_sync.FRAME))
        self.assertEqual(sum(on), int(1 / audio_sync.FRAME))


class BuildAppliesOffsetTests(unittest.TestCase):
    DOC = {"schema": 2, "content_kind": "broadcast", "date": "2026-11-02", "slug": "2026-11-02", "source": "einfach",
           "sentences": [{"de": "Guten Abend.", "zh": "晚上好。", "start": 10.64, "end": 13.64}],
           "stories": [{"title": "Begrüßung", "title_zh": "欢迎", "from": 0, "to": 0, "vocab": [], "grammar_points": []}]}

    def lesson_with_meta(self, meta):
        with tempfile.TemporaryDirectory() as tmp:
            prev = build.META
            build.META = Path(tmp)
            try:
                (build.META / "2026-11-02.json").write_text(json.dumps(meta))
                return build.lesson_payload(json.loads(json.dumps(self.DOC)))
            finally:
                build.META = prev

    def test_measured_offset_shifts_sentence_times(self):
        s = self.lesson_with_meta({"audio_offset": 2.3})["sentences"][0]
        self.assertEqual((s["start"], s["end"]), (12.94, 15.94))

    def test_tiny_offsets_are_ignored(self):
        s = self.lesson_with_meta({"audio_offset": -0.1})["sentences"][0]
        self.assertEqual((s["start"], s["end"]), (10.64, 13.64))


if __name__ == "__main__":
    unittest.main()

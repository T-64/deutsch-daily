import json
import shutil
import tempfile
import unittest
from pathlib import Path

import build


def page_data(html):
    return json.loads(html.split('<script id="dd-data" type="application/json">', 1)[1].split("</script>", 1)[0])


class AppPageTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.site = Path(self.tmp.name)
        shutil.copytree(build.SITE / "app", self.site / "app")
        self.prev = (build.SITE, build.APP_SHELL)
        build.SITE, build.APP_SHELL = self.site, self.site / "app" / "index.html"

    def tearDown(self):
        build.SITE, build.APP_SHELL = self.prev
        self.tmp.cleanup()

    def test_full_build_stamps_every_page_from_the_app_shell(self):
        build.build()
        home = (self.site / "index.html").read_text()
        data = page_data(home)
        self.assertEqual(data["page"], "home")
        self.assertTrue(data["items"])
        self.assertEqual(data["items"], sorted(data["items"], key=lambda x: x["date"], reverse=True))
        self.assertNotIn("20uhr", json.dumps(data))
        self.assertIn('src="app/assets/', home)
        self.assertNotIn('"./assets/', home)
        for name in ("open.html", "about.html"):
            self.assertIn('id="dd-data"', (self.site / name).read_text())
        self.assertIn("创建本地课程", (self.site / "studio.html").read_text())
        self.assertTrue((self.site / "assets" / "studio.js").exists())
        self.assertFalse(list(self.site.glob("*-20uhr.html")))

    def test_legacy_video_lesson_keeps_aligned_times(self):
        doc = json.loads((build.CONTENT / "2026-09-18.json").read_text())
        lesson = page_data(build.render(doc))["lesson"]
        self.assertEqual(lesson["kind"], "video")
        self.assertTrue(lesson["video"]["mp4"].endswith(".mp4"))
        self.assertGreater(sum(s["start"] is not None for s in lesson["sentences"]), len(lesson["sentences"]) * 0.7)
        covered = [i for st in lesson["stories"] for i in range(st["from"], st["to"] + 1)]
        self.assertEqual(covered, list(range(len(lesson["sentences"]))))

    def test_old_short_reading_shows_the_broadcast_not_the_rewrite(self):
        # Frozen copy of an Oct 2026 short reading (the live file has since been regenerated).
        doc = json.loads((Path(__file__).parent / "fixtures" / "reading-2026-10-20.json").read_text())
        lesson = page_data(build.render(doc))["lesson"]
        texts = " ".join(s["de"] for s in lesson["sentences"])
        self.assertIn("Willkommen zur tagesschau", texts)
        self.assertNotIn(doc["news"][0]["paragraphs"][0], texts)  # the AI rewrite is not shown twice
        self.assertTrue(all(s["start"] is not None for s in lesson["sentences"]))
        self.assertTrue(all(s["zh"] == "" for s in lesson["sentences"]))  # until regenerated

    def test_broadcast_lesson_maps_examples_from_sentence_indices(self):
        doc = {
            "schema": 2, "content_kind": "broadcast", "date": "2026-10-21", "slug": "2026-10-21", "source": "einfach",
            "sentences": [{"de": "Guten Abend.", "zh": "晚上好。", "start": 1.0, "end": 2.0},
                          {"de": "Die Regierung plant ein Gesetz.", "zh": "政府计划一部法律。", "start": 2.5, "end": 5.0}],
            "stories": [{"title": "Begrüßung", "title_zh": "欢迎", "from": 0, "to": 0, "vocab": [], "grammar_points": []},
                        {"title": "Gesetz", "title_zh": "法律", "from": 1, "to": 1,
                         "vocab": [{"lemma": "das Gesetz, -e", "key": "gesetz", "forms": ["Gesetz"], "pos": "Substantiv", "zh": "法律", "sentence": 1}],
                         "grammar_points": [{"title": "现在时", "summary": "表示计划。", "sentence": 1}]}],
        }
        lesson = build.lesson_payload(doc)
        v = lesson["stories"][1]["vocab"][0]
        self.assertEqual((v["example_de"], v["example_zh"]), ("Die Regierung plant ein Gesetz.", "政府计划一部法律。"))
        self.assertEqual(lesson["form_to_key"]["gesetz"], "gesetz")
        self.assertEqual(lesson["stories"][1]["grammar"][0]["example_de"], "Die Regierung plant ein Gesetz.")
        self.assertEqual(lesson["duration"], 5.0)

    def test_difficult_edition_is_not_buildable(self):
        with self.assertRaises(SystemExit):
            build.build("2026-08-20-20uhr")


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path

import build


class CatalogPageTests(unittest.TestCase):
    def test_builds_home_open_and_about_pages(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous_site = build.SITE
            build.SITE = Path(tmp)
            try:
                build.build_index(["2026-09-18", "2026-08-20-20uhr"])
                home = (build.SITE / "index.html").read_text()
                opener = (build.SITE / "open.html").read_text()
                about = (build.SITE / "about.html").read_text()
                studio = (build.SITE / "studio.html").read_text()
                studio_js = (build.SITE / "assets" / "studio.js").read_text()
                assets = sorted(x.name for x in (build.SITE / "assets").iterdir())
            finally:
                build.SITE = previous_site

        self.assertIn("每天一点，读懂德语。", home)
        self.assertIn("搜索主题或日期", home)
        self.assertIn("2026-09-18", opener)
        self.assertNotIn("2026-08-20-20uhr", opener + home)
        self.assertNotIn("打开一个视频", home)
        self.assertIn("创建本地课程", studio)
        self.assertIn("parseTimedText", studio_js)
        self.assertIn("studio.html", opener + about)
        self.assertNotIn("__ITEMS__", home + opener)
        for html in (home, opener, about, studio):
            for placeholder in ("__HEAD__", "__CORE__", "__FOOT__", "__V__"):
                self.assertNotIn(placeholder, html)
            self.assertIn("assets/site.css?v=", html)
            self.assertIn('data-settings', html)
        for name in ("site.css", "core.js", "reader.css", "reader.js", "anki.js", "studio.js"):
            self.assertIn(name, assets)

    def test_episode_page_uses_shared_assets_and_blind_reading(self):
        import json
        doc = json.loads((build.CONTENT / "2026-10-20.json").read_text())
        html = build.render(doc)
        self.assertIn("assets/reader.js?v=", html)
        self.assertIn('id="zh-toggle"', html)
        self.assertNotIn("__PAYLOAD__", html)
        payload = json.loads(html.split("const DATA = ", 1)[1].split(";\n", 1)[0])
        self.assertEqual(payload["slug"], "2026-10-20")

    def test_difficult_edition_is_not_buildable(self):
        with tempfile.TemporaryDirectory() as tmp:
            previous = build.SITE
            build.SITE = Path(tmp)
            try:
                with self.assertRaises(SystemExit):
                    build.build("2026-08-20-20uhr")
            finally:
                build.SITE = previous


if __name__ == "__main__":
    unittest.main()

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
                build.build_index(["2026-08-20-20uhr"])
                home = (build.SITE / "index.html").read_text()
                opener = (build.SITE / "open.html").read_text()
                about = (build.SITE / "about.html").read_text()
                studio = (build.SITE / "studio.html").read_text()
                studio_js = (build.SITE / "assets" / "studio.js").read_text()
            finally:
                build.SITE = previous_site

        self.assertIn("打开一个视频", home)
        self.assertIn("open.html#", about)
        self.assertIn("2026-08-20-20uhr", opener)
        self.assertIn("创建本地课程", studio)
        self.assertIn("parseTimedText", studio_js)
        self.assertIn("studio.html", home + opener + about)
        self.assertNotIn("__ITEMS__", home + opener)


if __name__ == "__main__":
    unittest.main()

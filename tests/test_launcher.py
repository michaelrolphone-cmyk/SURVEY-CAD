import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"


class LauncherPageTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = INDEX.read_text(encoding="utf-8")

    def test_logo_is_943_png(self):
        self.assertIn('src="943.png"', self.html)

    def test_all_apps_are_registered(self):
        expected_files = [
            "CPNF.HTML",
            "POINT_TRANSFORMER.HTML",
            "ROS.html",
            "VIEWPORT.HTML",
        ]
        for filename in expected_files:
            self.assertIn(filename, self.html)

    def test_launcher_has_navigation_controls(self):
        controls = [
            'id="backButton"',
            'id="appSelect"',
            'id="reloadButton"',
            'id="closeButton"',
            'id="appFrame"',
        ]
        for control in controls:
            self.assertIn(control, self.html)

    def test_open_app_assigns_iframe_src(self):
        self.assertRegex(self.html, re.compile(r"function openApp\(file\)\s*\{[^}]*appFrame\.src\s*=\s*file;", re.DOTALL))


if __name__ == "__main__":
    unittest.main()

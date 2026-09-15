"""Exercise the clean-room gate against isolated source fixtures."""
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]


class CleanRoomTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for directory in ('src', 'test', 'script'):
            shutil.copytree(PROJECT / directory, self.root / directory)
        (self.root / 'scripts').mkdir()
        shutil.copy(PROJECT / 'scripts/check-clean-room.sh', self.root / 'scripts')
        (self.root / 'lib').symlink_to(PROJECT / 'lib', target_is_directory=True)

    def check(self, expected_success, message):
        result = subprocess.run(
            ['bash', str(self.root / 'scripts/check-clean-room.sh')],
            capture_output=True, text=True, check=False,
        )
        self.assertEqual(result.returncode == 0, expected_success, result.stdout + result.stderr)
        self.assertIn(message, result.stdout + result.stderr)

    def test_original_headers_pass(self):
        self.check(True, 'clean-room gate: passed')

    def test_modified_helper_header_fails(self):
        helper = self.root / 'test/fizz/utils/DecimalPrinter.sol'
        helper.write_text(helper.read_text().replace('UNLICENSED', 'MIT', 1))
        self.check(False, 'expected UNLICENSED SPDX header')

    def test_new_non_mit_helper_fails(self):
        (self.root / 'test/fizz/utils/Unexpected.sol').write_text('// SPDX-License-Identifier: Unlicense\n')
        self.check(False, 'expected MIT SPDX header: test/fizz/utils/Unexpected.sol')

    def test_non_mit_production_file_fails(self):
        (self.root / 'src/Unexpected.sol').write_text('// SPDX-License-Identifier: Unlicense\n')
        self.check(False, 'expected MIT SPDX header: src/Unexpected.sol')

    def test_archive_import_still_fails(self):
        (self.root / 'test/Unexpected.sol').write_text('// SPDX-License-Identifier: MIT\nimport "archive/Legacy.sol";\n')
        self.check(False, 'an archive import was found')


if __name__ == '__main__':
    unittest.main()

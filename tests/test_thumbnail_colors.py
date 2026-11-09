"""Regression checks for CMYK conversion and embedded JPEG profile consistency."""
import importlib.util
from io import BytesIO
from pathlib import Path
import tempfile
import unittest
from PIL import Image, ImageCms

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('gallery_thumbnails', ROOT / 'tools/generate-thumbnails.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ThumbnailColors(unittest.TestCase):
    def round_trip(self, image):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'preview.jpg'
            module.save_thumbnail(image, target)
            with Image.open(target) as preview:
                preview.load()
                return preview.copy(), preview.info['icc_profile']

    def test_cmyk_cyan_is_color_transformed_and_output_profile_matches_rgb(self):
        with Image.open(ROOT / 'site/media/images/d9a03c4a-936e-4771-ba35-8a3dd81b361c.jpg') as original:
            source_icc = original.info['icc_profile']
        patch = Image.new('CMYK', (32, 32), (255, 0, 0, 0))
        patch.info['icc_profile'] = source_icc
        expected = ImageCms.profileToProfile(patch, ImageCms.ImageCmsProfile(BytesIO(source_icc)), module.SRGB, outputMode='RGB').getpixel((16, 16))
        preview, icc = self.round_trip(patch)
        self.assertEqual(preview.mode, 'RGB')
        self.assertEqual(ImageCms.ImageCmsProfile(BytesIO(icc)).profile.xcolor_space.strip(), 'RGB')
        actual = preview.getpixel((16, 16))
        self.assertLess(max(abs(a-b) for a, b in zip(actual, expected)), 5)
        self.assertGreater(max(abs(a-b) for a, b in zip(actual, patch.convert('RGB').getpixel((16, 16)))), 20)

    def test_transparent_pixels_use_white_background(self):
        preview, _ = self.round_trip(Image.new('RGBA', (16, 16), (255, 0, 0, 0)))
        self.assertTrue(all(value >= 254 for value in preview.getpixel((8, 8))))

    def test_untagged_rgb_keeps_its_colors(self):
        preview, _ = self.round_trip(Image.new('RGB', (16, 16), (30, 130, 220)))
        self.assertLess(max(abs(a-b) for a, b in zip(preview.getpixel((8, 8)), (30, 130, 220))), 4)


if __name__ == '__main__':
    unittest.main()

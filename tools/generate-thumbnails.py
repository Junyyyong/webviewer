"""Generate ICC-aware sRGB previews without changing recognition originals.

Requires Pillow (python3 -m pip install Pillow).
"""
from io import BytesIO
import json
import pathlib
import tempfile
from PIL import Image, ImageCms, ImageOps

ROOT = pathlib.Path(__file__).resolve().parents[1]
SRGB = ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB'))


def make_thumbnail(source):
    image = ImageOps.exif_transpose(source)
    alpha = image.getchannel('A') if 'A' in image.getbands() else None
    embedded = image.info.get('icc_profile')
    color_input = image.convert('RGB') if image.mode in ('RGBA', 'P', 'PA') else image
    if embedded:
        # Transform pixels using the source ICC; changing the profile tag alone
        # cannot convert CMYK numbers into their intended display colors.
        color = ImageCms.profileToProfile(
            color_input, ImageCms.ImageCmsProfile(BytesIO(embedded)), SRGB,
            outputMode='RGB', renderingIntent=ImageCms.Intent.PERCEPTUAL,
        )
    elif image.mode == 'CMYK':
        raise ValueError('CMYK image has no embedded ICC profile; source color space is unknown')
    else:
        color = image.convert('RGB')
    if alpha is not None:
        background = Image.new('RGB', color.size, 'white')
        background.paste(color, mask=alpha)
        color = background
    color.thumbnail((640, 640), Image.Resampling.LANCZOS)
    return color


def save_thumbnail(source, target):
    thumbnail = make_thumbnail(source)
    thumbnail.save(target, 'JPEG', quality=86, subsampling=0, optimize=True,
                   icc_profile=SRGB.tobytes())


def main():
    site = ROOT / 'site'
    manifest_path = site / 'content/manifest.json'
    manifest = json.loads(manifest_path.read_text())
    total = 0
    # Finish all conversions before replacing any public preview.
    with tempfile.TemporaryDirectory(prefix='webviewer-colors-') as work:
        staged = []
        for row in manifest['targets']:
            original = pathlib.PurePosixPath(row['image_path'])
            relative = f'media/thumbnails/{original.stem}.jpg'
            temporary = pathlib.Path(work) / f'{original.stem}.jpg'
            with Image.open(site / original) as image:
                save_thumbnail(image, temporary)
            staged.append((temporary, site / relative))
            row['thumbnail_path'] = relative
            total += temporary.stat().st_size
        for temporary, target in staged:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(temporary.read_bytes())
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'thumbnails': len(staged), 'total_KiB': round(total / 1024),
                      'output_profile': 'sRGB', 'originals_modified': False}))


if __name__ == '__main__':
    main()

"""Build lossless desktop and quality-85 mobile WebP; keep active PNG sources intact."""
from pathlib import Path
from PIL import Image
root = Path(__file__).resolve().parents[1] / 'dist' / 'assets'
limits = {'hero-surf-v1': (None,480), 'surfboard-v1': (320,None),
 'hero-front-v1': (None,410), 'hero-slip-v1': (None,560), 'hero-hurt-v1': (None,560),
 'durian-v1': (384,None), 'boss-necromancer-v1': (None,820),
 'enemy-phantoms-v1': (1152,384), 'ground-items-v1': (1536,512), 'floor-tile-v1': (1024,1024),
 'enemy-banana-slice-v1': (384,None),
 'milk-bottle-v1': (None,480),
 'banana-case-closed-v1': (640,None), 'banana-case-base-v1': (640,None),
 'giant-banana-body-v1': (480,None), 'giant-banana-head-v1': (None,560)}
mobile_root = root / 'mobile'
mobile_root.mkdir(exist_ok=True)
before = after = mobile_after = 0
for name, (width,height) in limits.items():
 source=root/(name+'.png'); target=root/(name+'.webp')
 with Image.open(source) as image:
  ratio=min(1, width/image.width if width else 1, height/image.height if height else 1)
  size=(round(image.width*ratio),round(image.height*ratio))
  if size!=image.size: image=image.resize(size,Image.Resampling.LANCZOS)
  image.save(target, 'WEBP', lossless=True, method=6, exact=True)
  mobile_target = mobile_root / (name+'.webp')
  image.save(mobile_target, 'WEBP', lossless=False, quality=85, method=6, exact=True)
 before+=source.stat().st_size;after+=target.stat().st_size;mobile_after+=mobile_target.stat().st_size
 print(f'{target.name}: {target.stat().st_size:,} bytes')
print(f'PNG sources: {before:,} bytes; desktop WebP: {after:,}; mobile Q85: {mobile_after:,} ({100*(1-mobile_after/after):.1f}% smaller than desktop)')

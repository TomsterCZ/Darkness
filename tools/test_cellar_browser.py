#!/usr/bin/env python3
"""Screenshot + runtime regression against the built GitHub Pages source."""
from pathlib import Path
import json
from PIL import Image, ImageStat
from playwright.sync_api import sync_playwright

URL="http://127.0.0.1:8899"
OUT=Path("artifacts")
OUT.mkdir(parents=True,exist_ok=True)

with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,args=["--no-sandbox","--disable-gpu"])
    page=browser.new_page(viewport={"width":1300,"height":760},device_scale_factor=2)
    errors=[]
    failed=[]
    def on_response(response):
        if response.status>=400 and "/assets/" in response.url:
            failed.append((response.status,response.url))
    page.on("pageerror",lambda e:errors.append(str(e)))
    page.on("response",on_response)
    page.goto(URL+"/cellar.html",wait_until="networkidle",timeout=60000)
    page.wait_for_function("window.__darknessCellar && window.__darknessCellar.level",timeout=20000)
    size=page.evaluate("""() => {
      const c=document.querySelector('#game');
      return [c.width,c.height];
    }""")
    assert size==[2170,1132],f"Expected 4x pixel area, got {size}"
    page.wait_for_function("window.__darknessCellar.artState !== 'loading'",timeout=20000)
    visual_mode=page.evaluate("window.__darknessCellar.artState")
    assert visual_mode=="approved" or visual_mode.startswith("fallback:"),visual_mode
    page.wait_for_timeout(1200)
    page.screenshot(path=str(OUT/"cellar_illustrated.png"),full_page=True,animations="disabled")
    state=page.evaluate("""() => ({
      level: window.__darknessCellar.level.tiles.length + 'x' + window.__darknessCellar.level.tiles[0].length,
      player: window.__darknessCellar.state.player,
      crates: window.__darknessCellar.state.crates,
      pixelRatio: window.devicePixelRatio,
      canvas: [document.querySelector('#game').width,document.querySelector('#game').height]
    })""")
    assert state["level"]=="11x13", state
    assert len(state["crates"])==4, state
    assert not errors, "Browser JS errors: "+repr(errors)
    assert not failed, "Broken asset URLs: "+repr(failed)
    im=Image.open(OUT/"cellar_illustrated.png").convert("RGB")
    stat=ImageStat.Stat(im)
    # Must contain the dungeon, rather than an entirely black/blank canvas.
    assert max(stat.stddev)>15, f"Unrendered image; pixel variance: {stat.stddev}"
    page.goto(URL+"/blueprint.html",wait_until="networkidle",timeout=60000)
    page.wait_for_function("document.querySelector('#summary').textContent.includes('wall squares')",timeout=20000)
    page.wait_for_timeout(300)
    page.screenshot(path=str(OUT/"blueprint_inspector.png"),full_page=True,animations="disabled")
    assert not errors, "Blueprint JS errors: "+repr(errors)
    browser.close()

(OUT/"browser_report.json").write_text(json.dumps({
    "status":"PASS","level":state["level"],"canvas":size,"crates":len(state["crates"]),
    "illustrationMode":visual_mode,"imageVariance":stat.stddev,"asset404s":failed,"jsErrors":errors},indent=2))
print("PASS screenshot",state,"stddev",stat.stddev,"screenshots",list(OUT.iterdir()))

/* v6.27.0 — cross-engine diagnostic (temporary): which scrollbar-width rules reach #stGroupChips on this engine at 1280px. */
const { chromium } = require("playwright");
const PORT = process.env.PORT || 8931;
(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; page.on("pageerror", e => errs.push(String(e).slice(0, 200)));
  await page.addInitScript(() => { try { localStorage.setItem("hnk_ws_onboarded", "1"); localStorage.setItem("hnk_ws_seen", "1"); } catch (e) {} });
  await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: "load" }); await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    switchPage("pgMeitu");
    const el = document.getElementById("stGroupChips"); const cs = getComputedStyle(el);
    const mq = q => matchMedia(q).matches;
    const rules = [];
    for (const ss of document.styleSheets) {
      let list; try { list = ss.cssRules; } catch (e) { continue; }
      const walk = (rs, media) => { for (const r of rs) {
        if (r.type === 4) walk(r.cssRules, (media ? media + " && " : "") + r.media.mediaText);
        else if (r.type === 12) walk(r.cssRules, (media ? media + " && " : "") + "@supports " + r.conditionText);
        else if (r.style && r.style.scrollbarWidth) { let m = false; try { m = el.matches(r.selectorText); } catch (e) {}
          if (m) rules.push({ sel: r.selectorText.slice(0, 90), val: r.style.scrollbarWidth, media: media || "", mediaMatches: media ? media.split(" && ").every(x => x.startsWith("@supports") ? true : matchMedia(x).matches) : true }); } } };
      walk(list, "");
    }
    /* experiments: which rule forms make this engine compute "thin" */
    const exp = {}; const inline = { style: el.getAttribute("style"), prop: el.style.scrollbarWidth };
    const tryRule = (name, css) => { const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st); exp[name] = getComputedStyle(el).scrollbarWidth; st.remove(); };
    tryRule("plainId", "#stGroupChips{scrollbar-width:thin}");
    tryRule("mediaHoverPointer", "@media(hover:hover) and (pointer:fine){#stGroupChips{scrollbar-width:thin}}");
    tryRule("mediaSpaced", "@media (hover: hover) and (pointer: fine) and (min-width: 1024px) { #stGroupChips { scrollbar-width: thin } }");
    tryRule("doubleId", "#stGroupChips#stGroupChips{scrollbar-width:thin}");
    tryRule("important", "#stGroupChips{scrollbar-width:thin !important}");
    tryRule("listCopy", "@media(hover:hover) and (pointer:fine) and (min-width:1024px){#stGroupChips,#libFilters,#libGroups,.prow,#stPendChips,#stGenBar .row,.ratio-rail,#stSuiteTabs{scrollbar-width:thin;scrollbar-color:#2a3450 transparent;padding-bottom:6px}}");
    const after = getComputedStyle(el).scrollbarWidth;
    return { ua: navigator.userAgent.slice(0, 70), computed: cs.scrollbarWidth, inline, exp, after, innerWidth, hover: mq("(hover:hover)"), pointer: mq("(pointer:fine)"), w1024: mq("(min-width:1024px)"), combo: mq("(hover:hover) and (pointer:fine) and (min-width:1024px)"), rules };
  });
  console.log(JSON.stringify(r, null, 1)); console.log("pageErrors", JSON.stringify(errs)); await b.close();
})();

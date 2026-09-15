/* dead-classes.js — 6.96.1
   An element that carries a class no rule can reach draws nothing. That is how
   class="phero" sat on the Video→Video and Talking Photo banners from 6.73.0
   and 6.75.1 until the owner photographed the cut: one word away from the
   .page-hero every other page uses, and no test was watching.

   THE RULE: every element with a class must have at least one source of style —
   one of its classes named by some rule, or its id named by some rule.

   This is EXACT for the Photoshop panel, and only for it: the panel's own UXP
   discipline is class-and-id selectors only (no descendant or tag rules for an
   element to be styled by invisibly), its markup carries no inline style= that
   draws, and its gate keeps its rules in the one inline <style> block, which is
   read here alongside the stylesheet. Script blocks are blanked first, because
   a class inside a JavaScript string is not markup. */
"use strict";
const fs = require("fs");

function unstyledElements(htmlPath, cssPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  let css = fs.readFileSync(cssPath, "utf8");
  const inline = html.match(/<style[^>]*>[\s\S]*?<\/style>/g) || [];
  inline.forEach(b => { css += "\n" + b.replace(/<\/?style[^>]*>/g, ""); });
  css = css.replace(/\/\*[\s\S]*?\*\//g, " ");             /* a name in prose is not a rule */
  const styled = new Set(), ids = new Set();
  (css.match(/\.-?[A-Za-z_][\w-]*/g) || []).forEach(t => styled.add(t.slice(1)));
  (css.match(/#[A-Za-z_][\w-]*/g) || []).forEach(t => ids.add(t.slice(1)));
  /* keep the line numbering while removing script bodies */
  const markup = html.replace(/<script[^>]*>[\s\S]*?<\/script>/g, m => m.replace(/[^\n]/g, " "));
  const out = [];
  const tag = /<(\w+)([^>]*\bclass="([^"]*)"[^>]*)>/g;
  let m;
  while ((m = tag.exec(markup)) !== null) {
    const classes = m[3].split(/\s+/).filter(Boolean);
    if (!classes.length) continue;
    const idm = /\bid="([^"]+)"/.exec(m[2]);
    const id = idm ? idm[1] : null;
    if (classes.some(c => styled.has(c))) continue;
    if (id && ids.has(id)) continue;
    out.push({ line: markup.slice(0, m.index).split("\n").length, tag: m[1], classes: classes.join(" "), id: id });
  }
  return out;
}

module.exports = { unstyledElements };

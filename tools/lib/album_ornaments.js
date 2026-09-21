/* tools/lib/album_ornaments.js — 6.122.0 wave G: THE ORNAMENT CATALOGUE.

   Twenty-four ornaments in six families and five page overlays. Each ornament is ONE alpha
   mask — a white shape on transparency, docs/app/lib/album/orn/<id>.png, 512 px on its long
   edge — that the album module tints at draw time (gold, white, ink, rose, sage) so one file
   serves every paper. `ar` is width / height of that file; `def` is where a new copy lands on a
   page (centre and width as fractions of the safe area) so a corner arrives in a corner and a
   frame arrives as a frame. The files are drawn by tools/build_album_ornaments.js from the
   recipes at the foot of this table and pinned by docs/app/lib/album/ornaments.json; the
   catalogue below is folded into docs/app/data/album.js (window.HNK_ALBUM.orn / .ovl) by
   tools/build_album_data.js, and the Photoshop panel gets the same files under icons/album/. */
"use strict";
const FAMILIES = ["corner", "divider", "frame", "botanic", "shape", "tape"];
/* def: x · y are the CENTRE, w the width, all fractions of the safe area; rot in degrees */
const ORNAMENTS = [
  { id: "c1", fam: "corner",  ar: 1,    def: { x: 0.12, y: 0.16, w: 0.16, rot: 0 } },
  { id: "c2", fam: "corner",  ar: 1,    def: { x: 0.12, y: 0.16, w: 0.16, rot: 0 } },
  { id: "c3", fam: "corner",  ar: 1,    def: { x: 0.12, y: 0.16, w: 0.16, rot: 0 } },
  { id: "c4", fam: "corner",  ar: 1,    def: { x: 0.12, y: 0.16, w: 0.16, rot: 0 } },
  { id: "d1", fam: "divider", ar: 6,    def: { x: 0.5,  y: 0.5,  w: 0.36, rot: 0 } },
  { id: "d2", fam: "divider", ar: 6,    def: { x: 0.5,  y: 0.5,  w: 0.36, rot: 0 } },
  { id: "d3", fam: "divider", ar: 6,    def: { x: 0.5,  y: 0.5,  w: 0.36, rot: 0 } },
  { id: "d4", fam: "divider", ar: 6,    def: { x: 0.5,  y: 0.5,  w: 0.36, rot: 0 } },
  { id: "f1", fam: "frame",   ar: 1.5,  def: { x: 0.5,  y: 0.5,  w: 1,    rot: 0 } },
  { id: "f2", fam: "frame",   ar: 1.5,  def: { x: 0.5,  y: 0.5,  w: 1,    rot: 0 } },
  { id: "f3", fam: "frame",   ar: 1.5,  def: { x: 0.5,  y: 0.5,  w: 1,    rot: 0 } },
  { id: "f4", fam: "frame",   ar: 1.5,  def: { x: 0.5,  y: 0.5,  w: 1,    rot: 0 } },
  { id: "b1", fam: "botanic", ar: 0.5,  def: { x: 0.9,  y: 0.72, w: 0.1,  rot: 0 } },
  { id: "b2", fam: "botanic", ar: 0.5,  def: { x: 0.9,  y: 0.72, w: 0.1,  rot: 0 } },
  { id: "b3", fam: "botanic", ar: 0.5,  def: { x: 0.9,  y: 0.72, w: 0.1,  rot: 0 } },
  { id: "b4", fam: "botanic", ar: 0.5,  def: { x: 0.9,  y: 0.72, w: 0.1,  rot: 0 } },
  { id: "s1", fam: "shape",   ar: 1,    def: { x: 0.5,  y: 0.5,  w: 0.12, rot: 0 } },
  { id: "s2", fam: "shape",   ar: 1.5,  def: { x: 0.5,  y: 0.5,  w: 0.16, rot: 0 } },
  { id: "s3", fam: "shape",   ar: 1,    def: { x: 0.5,  y: 0.5,  w: 0.12, rot: 0 } },
  { id: "s4", fam: "shape",   ar: 1.5,  def: { x: 0.5,  y: 0.5,  w: 0.3,  rot: 0 } },
  { id: "t1", fam: "tape",    ar: 4,    def: { x: 0.5,  y: 0.08, w: 0.22, rot: -4 } },
  { id: "t2", fam: "tape",    ar: 3,    def: { x: 0.5,  y: 0.9,  w: 0.26, rot: 0 } },
  { id: "t3", fam: "tape",    ar: 1,    def: { x: 0.88, y: 0.14, w: 0.11, rot: 8 } },
  { id: "t4", fam: "tape",    ar: 3.5,  def: { x: 0.5,  y: 0.88, w: 0.3,  rot: 0 } }
];
/* the overlays: the whole page under a texture. `blend` is the canvas composite operation the
   texture is laid on with; `amounts` the three strengths the chips offer, as alpha. */
const OVERLAYS = [
  /* grain and paper are per-pixel noise, which PNG cannot compress — they are drawn small and
     stretched over the page, which for noise is the same picture at a fifth of the bytes */
  { id: "grain",    blend: "overlay",  amounts: { light: 0.22, medium: 0.4, strong: 0.62 }, size: [480, 320] },
  { id: "vignette", blend: "multiply", amounts: { light: 0.3,  medium: 0.55, strong: 0.85 } },
  { id: "leak",     blend: "screen",   amounts: { light: 0.3,  medium: 0.55, strong: 0.8 } },
  { id: "dust",     blend: "screen",   amounts: { light: 0.35, medium: 0.6, strong: 0.85 } },
  { id: "paper",    blend: "multiply", amounts: { light: 0.25, medium: 0.45, strong: 0.7 }, size: [600, 400] }
];
const AMOUNTS = ["light", "medium", "strong"];
const TINTS = { gold: "#b08d57", white: "#ffffff", ink: "#1b1b1f", rose: "#c98a86", sage: "#7f9a7c" };
const ORN_LONG = 512;              /* px on the mask's long edge */
const OVL_W = 1200, OVL_H = 800;   /* the texture files */

/* the public table (no recipes) that goes into window.HNK_ALBUM */
function catalogue() {
  return {
    orn: ORNAMENTS.map(function (o) { return { id: o.id, fam: o.fam, ar: o.ar, def: o.def }; }),
    ornFamilies: FAMILIES.slice(),
    ovl: OVERLAYS.map(function (o) { return { id: o.id, blend: o.blend, amounts: o.amounts }; }),
    ovlAmounts: AMOUNTS.slice(),
    tints: TINTS
  };
}
module.exports = { FAMILIES, ORNAMENTS, OVERLAYS, AMOUNTS, TINTS, ORN_LONG, OVL_W, OVL_H, catalogue };

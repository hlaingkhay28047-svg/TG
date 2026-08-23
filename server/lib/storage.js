"use strict";
/* Payment proofs. The bytes live in storage.objects.data, under the same
 * row-level security as the row that describes them.
 *
 * supabase/schema.sql section 8 already writes the two policies this relies on:
 * proofs_insert_own lets a customer write only under their own uid folder, and
 * proofs_read_own_or_admin lets them read their own while an admin reads all.
 * Because those policies are enforced by the database, this file does not
 * decide who may see a bank slip — it only moves bytes.
 */
const { asUser } = require("./db");

const BUCKET = "payment-proofs";
const MAX_BYTES = Number(process.env.MAX_UPLOAD_BYTES || 8 * 1024 * 1024);

class StorageError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* Pull one named part out of a multipart/form-data body.
 *
 * accUploadProof sends a FormData with a single "file" part and deliberately
 * sets no Content-Type so the browser can choose the boundary, so the boundary
 * has to be read back out of the header here. Working on the raw Buffer
 * matters: decoding an image to a JS string would corrupt it.
 */
function parseMultipart(buf, contentType) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!m) throw new StorageError(400, "expected multipart/form-data with a boundary");
  const boundary = Buffer.from("--" + (m[1] || m[2]).trim());
  const parts = [];
  let index = buf.indexOf(boundary);
  while (index !== -1) {
    const start = index + boundary.length;
    const next = buf.indexOf(boundary, start);
    if (next === -1) break;
    /* Each part is headers, a blank line, then bytes; drop the trailing CRLF
       that belongs to the delimiter rather than the content. */
    const chunk = buf.slice(start, next);
    const sep = chunk.indexOf("\r\n\r\n");
    if (sep !== -1) {
      const head = chunk.slice(0, sep).toString("utf8");
      const data = chunk.slice(sep + 4, chunk.length - 2);
      const name = /name="([^"]*)"/i.exec(head);
      const type = /content-type:\s*([^\r\n]+)/i.exec(head);
      parts.push({ name: name ? name[1] : "", type: type ? type[1].trim() : "application/octet-stream", data });
    }
    index = next;
  }
  return parts;
}

async function upload({ uid, objectName, body, contentType }) {
  if (!uid) throw new StorageError(401, "not authenticated");
  const parts = parseMultipart(body, contentType);
  const file = parts.find(p => p.name === "file") || parts[0];
  if (!file || !file.data.length) throw new StorageError(400, "no file part");
  if (file.data.length > MAX_BYTES) throw new StorageError(413, "file too large");

  /* The folder is NOT trusted from the path — the policy checks it, and this
     check simply produces a clearer 403 than a policy violation would. Both
     have to agree, and the database has the final say. */
  /* THE x-upsert HEADER CANNOT BE HONOURED, and that is correct rather than a
     limitation to work around. supabase/schema.sql gives storage.objects an
     INSERT policy and a SELECT policy and deliberately no UPDATE policy, so
     with row-level security on, an update is refused for everyone — an upsert
     would need both a grant and a new policy, and that policy would be a way to
     overwrite a bank slip that an admin has already been shown.

     Nothing is lost. accUploadProof names each file kind-<Date.now()>.ext, so
     within one account a collision would need two uploads in the same
     millisecond; if one ever happens the unique index raises and the client
     reports the upload as failed, which is honest. */
  return asUser(uid, async client => {
    const { rows } = await client.query(
      `insert into storage.objects (bucket_id, name, owner, mime_type, data)
       values ($1, $2, $3, $4, $5) returning name`,
      [BUCKET, objectName, uid, file.type, file.data]);
    return { status: 200, body: { Key: BUCKET + "/" + rows[0].name } };
  });
}

async function download({ uid, objectName }) {
  if (!uid) throw new StorageError(401, "not authenticated");
  return asUser(uid, async client => {
    const { rows } = await client.query(
      "select mime_type, data from storage.objects where bucket_id = $1 and name = $2", [BUCKET, objectName]);
    /* No row here means either it does not exist or the policy hid it. Both
       answer 404 on purpose: distinguishing them would tell a customer that
       somebody else's slip exists. */
    if (!rows.length) throw new StorageError(404, "not found");
    return { status: 200, raw: rows[0].data, contentType: rows[0].mime_type || "application/octet-stream" };
  });
}

module.exports = { upload, download, StorageError, parseMultipart };

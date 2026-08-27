"use strict";

const net=require("net");

function resolveClientAddress(req,trustProxyHops,trustDoConnectingIp) {
  const socketAddress=String(req&&req.socket&&req.socket.remoteAddress||"").trim();
  const digitalOcean=String(req&&req.headers&&req.headers["do-connecting-ip"]||"").trim();
  /* App Platform documents do-connecting-ip as the original client and uses
     X-Forwarded-For for its own ingress address. Trust it only when deployment
     configuration explicitly says this process is behind that ingress. */
  if (trustDoConnectingIp&&net.isIP(digitalOcean)) return digitalOcean;
  const hops=Math.min(5,Math.max(0,Number(trustProxyHops)||0));
  if (!hops) return socketAddress;
  const chain=String(req&&req.headers&&req.headers["x-forwarded-for"]||"")
    .split(",").map(value=>value.trim()).filter(Boolean);
  const candidate=chain[chain.length-hops]||"";
  /* Select from the trusted end of the chain. The old first-item rule let a
     caller prepend a forged address and evade every per-IP counter. */
  return net.isIP(candidate)?candidate:socketAddress;
}

module.exports={resolveClientAddress};

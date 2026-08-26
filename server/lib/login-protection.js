"use strict";

function evaluateFailedLoginThrottle(input) {
  const state=input||{};
  const emailIpLimit=Math.max(3,Number(state.emailIpLimit||5));
  const emailLimit=Math.max(emailIpLimit,Number(state.emailLimit||10));
  const ipLimit=Math.max(emailIpLimit+1,Number(state.ipLimit||25));
  const emailIpFailures=Math.max(0,Number(state.emailIpFailures||0));
  const emailFailures=Math.max(0,Number(state.emailFailures||0));
  const ipFailures=Math.max(0,Number(state.ipFailures||0));
  if (ipFailures>=ipLimit) return {blocked:true,reason:"ip_rate_limited"};
  if (emailFailures>=emailLimit) return {blocked:true,reason:"email_rate_limited"};
  if (emailIpFailures>=emailIpLimit) return {blocked:true,reason:"email_ip_rate_limited"};
  return {blocked:false,reason:"allowed"};
}

function evaluateAuthAttemptThrottle(input) {
  const state=input||{};
  const ipLimit=Math.max(1,Number(state.ipLimit||5));
  const emailLimit=Math.max(1,Number(state.emailLimit||3));
  const globalLimit=Math.max(ipLimit,Number(state.globalLimit||200));
  if (Math.max(0,Number(state.globalAttempts||0))>=globalLimit) {
    return {blocked:true,reason:"global_rate_limited"};
  }
  if (Math.max(0,Number(state.ipAttempts||0))>=ipLimit) {
    return {blocked:true,reason:"ip_rate_limited"};
  }
  if (Math.max(0,Number(state.emailAttempts||0))>=emailLimit) {
    return {blocked:true,reason:"email_rate_limited"};
  }
  return {blocked:false,reason:"allowed"};
}

function evaluateLoginAdmissionThrottle(input) {
  const state=input||{};
  const ipLimit=Math.max(1,Number(state.ipLimit||20));
  const globalLimit=Math.max(ipLimit,Number(state.globalLimit||300));
  if (Math.max(0,Number(state.globalAttempts||0))>=globalLimit) {
    return {blocked:true,reason:"global_rate_limited"};
  }
  if (Math.max(0,Number(state.ipAttempts||0))>=ipLimit) {
    return {blocked:true,reason:"ip_rate_limited"};
  }
  return {blocked:false,reason:"allowed"};
}

module.exports={evaluateFailedLoginThrottle,evaluateAuthAttemptThrottle,
  evaluateLoginAdmissionThrottle};

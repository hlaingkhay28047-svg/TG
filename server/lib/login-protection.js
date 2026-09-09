"use strict";

/* 6.39.4 — the failed-login and login-admission evaluators are gone with the
   sign-in lockout they served (owner instruction; see server/lib/auth.js).
   What remains is the throttle for the doors that send mail or create
   accounts: signup, password recovery, the recovery probe and password
   change. Those are not the sign-in door, and a student who mistypes a
   password never touches them. */
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

module.exports={evaluateAuthAttemptThrottle};

"use strict";

class ApiError extends Error {
  constructor(status, message, code, details) {
    super(message);
    this.status = status;
    this.code = code || "bad_request";
    if (details !== undefined) this.details = details;
  }
}

module.exports = { ApiError };

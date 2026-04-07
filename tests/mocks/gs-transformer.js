/**
 * Custom Jest transformer that treats .gs files as plain JavaScript.
 * Google Apps Script files are ES5-compatible JS — no transpilation needed.
 */
module.exports = {
  process(src) {
    return { code: src };
  },
};

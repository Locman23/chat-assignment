/**
 * Wrap an express route handler so rejected promises propagate to next().
 * Similar to popular implementations; keeps code DRY.
 * @param {Function} fn Express handler (req,res,next) => Promise|any
 * @returns {Function}
 */
module.exports = function asyncHandler(fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('asyncHandler expects a function');
  }
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

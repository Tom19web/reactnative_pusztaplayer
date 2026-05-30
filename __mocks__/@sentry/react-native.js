const noop = () => {};
const wrap = (x) => x;

module.exports = {
  captureException: noop,
  captureMessage: noop,
  init: noop,
  wrap: wrap,
  default: { captureException: noop, init: noop, wrap: wrap },
};

function log(message, obj) {
  const prefix = `[${new Date().toISOString()}]`;
  if (obj === undefined) {
    console.log(`${prefix} ${message}`);
  } else {
    console.log(`${prefix} ${message}`, obj);
  }
}

function error(message, obj) {
  const prefix = `[${new Date().toISOString()}]`;
  if (obj === undefined) {
    console.error(`${prefix} ${message}`);
  } else {
    console.error(`${prefix} ${message}`, obj);
  }
}

module.exports = { log, error };

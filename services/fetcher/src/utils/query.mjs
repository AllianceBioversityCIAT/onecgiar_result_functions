/**
 * Returns a function that returns the value of the query parameter after applying the pipe function
 * @param {import('express').Request} request The express request object
 * @returns {Function} A function that returns the value of the query parameter
 */
export const queryParam = (request) => {
  /**
   * Returns a function that returns the value of the query parameter after applying the pipe function
   * @param {string} key The key of the query parameter
   * @param {Function} pipeFunction The pipe function to apply to the value
   * @returns {Function} A function that returns the value of the query parameter
   */
  return (key, pipeFunction = (value) => value) => {
    const value = request.query[key];
    if (value) {
      return pipeFunction(value);
    }
    return undefined;
  };
};

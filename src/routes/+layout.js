/**
 *
 * @param {{url: URL}} param0
 * @returns {{currentRoute: string}}
 */
export const load = ({ url }) => {
  const currentRoute = url.pathname;

  return {
    currentRoute
  };
};

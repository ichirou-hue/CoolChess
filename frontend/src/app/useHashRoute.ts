import { useEffect, useState } from 'react';

export function useHashRoute() {
  const getRoute = () => window.location.hash.replace(/^#/, '').split('/')[0] || 'home';
  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const onHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return route;
}

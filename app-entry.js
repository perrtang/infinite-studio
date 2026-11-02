import { sharedLinkRedirect } from './share-domain-redirect.js';

const destination = sharedLinkRedirect(window.location.href);
if (destination) window.location.replace(destination);
else import('./main.jsx');

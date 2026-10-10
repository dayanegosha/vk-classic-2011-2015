/* The local popup preview shares settings and messages with its parent fixture. */
if (window.parent !== window && window.parent.chrome?.storage) window.chrome = window.parent.chrome;

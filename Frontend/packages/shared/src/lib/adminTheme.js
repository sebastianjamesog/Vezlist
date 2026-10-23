export const ADMIN_THEME_KEY = "vezlist:admin:theme";

// Runs before hydration so a saved dark preference does not flash white.
export const ADMIN_THEME_INIT = `(function(){var t;try{t=localStorage.getItem(${JSON.stringify(ADMIN_THEME_KEY)});}catch(e){}document.documentElement.dataset.adminTheme=t==='dark'||t==='light'?t:(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');})();`;

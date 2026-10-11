import { Logger } from 'tslog';

// constants
export const log = new Logger({ minLevel: 2 });

const doc: HTMLElement = document.documentElement;
const theme_button = document.getElementById("theme_button") as HTMLButtonElement | null;

// Startup
log.info("Loaded main");

// handle theme changing
if(theme_button) {
    theme_button.addEventListener('click', () => {
        const current: string | null = doc.getAttribute('data-theme');
        const main_logo = document.getElementById("main_logo") as HTMLImageElement;
        const theme_button_img = document.getElementById("theme_button_img") as HTMLImageElement;

        if(current === "light") {
            switchTheme("dark");
            main_logo.src = "/static/logo_full_light.svg";
            theme_button_img.src = "/static/theme_change_light.svg";
        } else {
            switchTheme("light");
            main_logo.src = "/static/logo_full_dark.svg";
            theme_button_img.src = "/static/theme_change_dark.svg";
        }
    });
} else {
    log.fatal("Theme button is NULL!");
}

// switchs and saves user themes
function switchTheme(theme: string) {
    doc.setAttribute('data-theme', theme);
    localStorage.setItem('user-theme', theme);

    log.info(`Changed theme to ${theme}`);
}
import { Logger } from 'tslog';

// constants
export const log = new Logger({ minLevel: 2 });

// Startup
log.info("Loaded main");

const b = document.getElementById("theme_button") as HTMLButtonElement | null;

if(b) {
    b.addEventListener('click', () => {
        document.documentElement.setAttribute('data-theme', "funky");
        localStorage.setItem('theme', "funky");
    });
}

function switchTheme(theme: string) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('user-theme', theme);

    log.info(`Changed theme to ${theme}`);
}
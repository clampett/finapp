import {log} from "./main.js";

// constants
const login_button = document.getElementById("login_button") as HTMLButtonElement | null;
const registration_button = document.getElementById("registration_button") as HTMLButtonElement | null;

// startup
log.info("Loaded login")

if(login_button) {
    login_button.addEventListener("click", () => {
        // const username_field = document.getElementById("username") as HTMLInputElement | null;
        // const password_field = document.getElementById("password") as HTMLInputElement | null;

        // if(username_field == null) {
        //     log.fatal("Username field is NULL!");
        // }
        // if(password_field == null) {
        //     log.fatal("Password field is NULL!");
        // }

        // const username = 

        // login(username, hashed_password);
        window.location.href = "/dashboard/";
  });
} else {
    log.fatal("Login button is NULL!");
}

if(registration_button) {
    registration_button.addEventListener("click", () => {
        registration();
    });
} else {
    log.error("Registration button is NULL!");
}

//
function login(username: string, hashed_password: string): boolean {
    return true;
}

async function hashPassword(password: string | undefined): Promise<string> {
    return "";
}

//
function registration(): boolean {
    return true;
}
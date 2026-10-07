package com.finapp.javabackend.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class DashboardController {

    @GetMapping({
        "/dashboard",
        "/dashboard/",
        "/dashboard/{a:[^\\.]*}",
        "/dashboard/{a:[^\\.]*}/{b:[^\\.]*}",
        "/dashboard/{a:[^\\.]*}/{b:[^\\.]*}/{c:[^\\.]*}"
    })
    public String dashboard() {
        return "forward:/dashboard/index.html";
    }
}
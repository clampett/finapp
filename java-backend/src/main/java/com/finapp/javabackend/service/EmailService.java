package com.finapp.javabackend.services;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.util.Random;

@Service
public class EmailService {

    @Autowired(required = false) // required=false prevents crashes if SMTP properties are missing
    private JavaMailSender mailSender;

    public String generateSixDigitCode() {
        Random rnd = new Random();
        int number = rnd.nextInt(999999);
        return String.format("%06d", number);
    }

    public void sendVerificationEmail(String toEmail, String code) {
        System.out.println("\n==========================================");
        System.out.println("🔒 DEVELOPMENT MOCK EMAIL 🔒");
        System.out.println("To: " + toEmail);
        System.out.println("Subject: FinApp - Your Verification Code");
        System.out.println("CODE: " + code);
        System.out.println("==========================================\n");

        if (mailSender != null) {
            try {
                SimpleMailMessage message = new SimpleMailMessage();
                message.setTo(toEmail);
                message.setSubject("FinApp - Your Verification Code");
                message.setText("Your 6-digit verification code is: " + code + "\n\nThis code expires in 15 minutes.");
                message.setFrom("security@finapp.com");
                mailSender.send(message);
            } catch (Exception e) {
                System.out.println("SMTP not configured. Email blocked, but code was printed above.");
            }
        }
    }
}
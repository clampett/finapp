package com.finapp.javabackend.services;

import java.security.SecureRandom;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
public class EmailService {

    @Value("${finapp.mail.mode:console}")
    private String mailMode = "console";

    private final SecureRandom random = new SecureRandom();

    @Autowired(required = false) // required=false prevents crashes if SMTP properties are missing
    private JavaMailSender mailSender;

    public String generateSixDigitCode() {
        // Generated all six-digit values, including leading zeros, with a secure
        // generator and locale-independent digits accepted by the verification UI.
        int number = random.nextInt(1_000_000);
        return String.format(Locale.ROOT, "%06d", number);
    }

    public void sendVerificationEmail(String toEmail, String code) {
        // Selected console delivery before contacting any SMTP server, keeping
        // local registration independent of email credentials or network delays.
        // Console codes are a local development delivery method, not public email.
        if (!"console".equals(mailMode)) {
            sendSmtp(toEmail, code);
            return;
        }
        System.out.println("\n==========================================");
        System.out.println("FINAPP LOCAL VERIFICATION CODE");
        System.out.println("To: " + toEmail);
        System.out.println("Subject: FinApp - Your Verification Code");
        System.out.println("CODE: " + code);
        System.out.println("==========================================\n");
    }

    private void sendSmtp(String toEmail, String code) {
        if (!"smtp".equals(mailMode) || mailSender == null) {
            throw new IllegalStateException(
                "Configure finapp.mail.mode as console or smtp with a mail sender."
            );
        }
        if (mailSender != null) {
            try {
                SimpleMailMessage message = new SimpleMailMessage();
                message.setTo(toEmail);
                message.setSubject("FinApp - Your Verification Code");
                message.setText(
                    "Your 6-digit verification code is: " +
                        code +
                        "\n\nThis code expires in 15 minutes."
                );
                message.setFrom("security@finapp.com");
                mailSender.send(message);
            } catch (Exception e) {
                throw new IllegalStateException(
                    "Unable to send verification email. Check SMTP configuration.",
                    e
                );
            }
        }
    }
}

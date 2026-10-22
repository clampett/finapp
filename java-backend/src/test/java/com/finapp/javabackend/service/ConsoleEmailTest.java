package com.finapp.javabackend.service;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.finapp.javabackend.services.EmailService;
import java.io.ByteArrayOutputStream;
import java.io.PrintStream;
import org.junit.jupiter.api.Test;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.util.ReflectionTestUtils;

class ConsoleEmailTest {

    @Test
    void consoleDeliveryDoesNotAttemptSmtpAndPrintsAsciiCode() {
        EmailService email = new EmailService();
        JavaMailSender smtp = mock(JavaMailSender.class);
        ReflectionTestUtils.setField(email, "mailSender", smtp);
        PrintStream original = System.out;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        try {
            System.setOut(new PrintStream(output));
            email.sendVerificationEmail("student@example.test", "012345");
        } finally {
            System.setOut(original);
        }
        assertTrue(output.toString().contains("CODE: 012345"));
        assertTrue(
            output
                .toString()
                .chars()
                .allMatch(c -> c < 128)
        );
        verifyNoInteractions(smtp);
        for (int i = 0; i < 100; i++) assertTrue(email.generateSixDigitCode().matches("[0-9]{6}"));
    }
}

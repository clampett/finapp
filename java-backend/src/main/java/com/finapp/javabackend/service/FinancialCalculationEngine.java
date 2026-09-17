package com.finapp.javabackend.service;

import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.Map;

@Component
public class FinancialCalculationEngine {

    public BigDecimal calculateTaxWithholding(BigDecimal grossSalary) {
        if (grossSalary == null || grossSalary.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        // Approximate standard 22% tax withholding rate for baseline estimations
        return grossSalary.multiply(new BigDecimal("0.22")).setScale(2, RoundingMode.HALF_UP);
    }

    public Map<String, Object> calculateDebtAmortization(BigDecimal balance, BigDecimal apr, BigDecimal monthlyPayment) {
        Map<String, Object> result = new HashMap<>();

        if (balance == null || apr == null || monthlyPayment == null || monthlyPayment.compareTo(BigDecimal.ZERO) <= 0) {
            result.put("monthsToPayoff", -1);
            result.put("totalInterestPaid", BigDecimal.ZERO);
            return result;
        }

        BigDecimal monthlyRate = apr.divide(new BigDecimal("100"), 8, RoundingMode.HALF_UP)
                .divide(new BigDecimal("12"), 8, RoundingMode.HALF_UP);

        BigDecimal currentBalance = balance;
        BigDecimal totalInterest = BigDecimal.ZERO;
        int months = 0;

        while (currentBalance.compareTo(BigDecimal.ZERO) > 0 && months < 600) { // Limit to 50 years max safety bound
            BigDecimal monthlyInterest = currentBalance.multiply(monthlyRate).setScale(2, RoundingMode.HALF_UP);

            if (monthlyPayment.compareTo(monthlyInterest) <= 0) {
                // Payment is too low to cover interest (infinite loop prevention)
                result.put("monthsToPayoff", -1);
                result.put("totalInterestPaid", totalInterest);
                return result;
            }

            BigDecimal principalPaid = monthlyPayment.subtract(monthlyInterest);
            if (principalPaid.compareTo(currentBalance) > 0) {
                principalPaid = currentBalance;
            }

            currentBalance = currentBalance.subtract(principalPaid);
            totalInterest = totalInterest.add(monthlyInterest);
            months++;
        }

        result.put("monthsToPayoff", months);
        result.put("totalInterestPaid", totalInterest.setScale(2, RoundingMode.HALF_UP));
        return result;
    }
}
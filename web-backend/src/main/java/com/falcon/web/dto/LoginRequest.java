package com.falcon.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
    @NotBlank @JsonProperty("username") String username,
    @NotBlank @Size(min = 8) @JsonProperty("password") String password
) {}

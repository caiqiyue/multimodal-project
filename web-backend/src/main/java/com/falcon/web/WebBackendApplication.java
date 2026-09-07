package com.falcon.web;

import com.falcon.web.config.UpstreamProperties;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;

@SpringBootApplication
@EnableConfigurationProperties(UpstreamProperties.class)
public class WebBackendApplication {
  public static void main(String[] args) {
    SpringApplication.run(WebBackendApplication.class, args);
  }
}
# Falcon Web Backend (Spring Boot BFF)

Thin BFF forwarding browser requests to the existing FastAPI on :9000.
Not an agent re-implementation — pure HTTP forward + WS relay.

## Run
mvn spring-boot:run        # boots on :8080
mvn test                   # JUnit 5 + MockWebServer
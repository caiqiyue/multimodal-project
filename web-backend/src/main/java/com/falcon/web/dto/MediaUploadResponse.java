package com.falcon.web.dto;

import com.fasterxml.jackson.annotation.JsonProperty;

public record MediaUploadResponse(
    @JsonProperty("media_id") String mediaId,
    @JsonProperty("url") String url,
    @JsonProperty("media_type") String mediaType,
    @JsonProperty("size_bytes") long sizeBytes,
    @JsonProperty("width") Integer width,
    @JsonProperty("height") Integer height,
    @JsonProperty("duration_seconds") Double durationSeconds
) {}

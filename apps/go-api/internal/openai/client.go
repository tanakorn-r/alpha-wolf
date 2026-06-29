package openai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"alpha-wolf/apps/go-api/internal/config"
)

type Client struct {
	apiKey string
	model  string
	http   *http.Client
}

func NewClient(cfg config.Config) *Client {
	return &Client{
		apiKey: cfg.OpenAIAPIKey,
		model:  cfg.OpenAIModel,
		http:   &http.Client{Timeout: 45 * time.Second},
	}
}

func (c *Client) Enabled() bool {
	return strings.TrimSpace(c.apiKey) != ""
}

func (c *Client) AnalyzeJSON(instructions string, context map[string]any, maxTokens int) (map[string]any, error) {
	if !c.Enabled() {
		return nil, fmt.Errorf("OPENAI_API_KEY is not configured")
	}
	payload := map[string]any{
		"model":             c.model,
		"instructions":      instructions,
		"input":             mustJSON(context),
		"max_output_tokens": maxTokens,
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("OpenAI returned HTTP %d", resp.StatusCode)
	}

	var decoded map[string]any
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, err
	}
	text := extractOutputText(decoded)
	if text == "" {
		return nil, fmt.Errorf("OpenAI returned no usable text")
	}
	var result map[string]any
	if err := json.Unmarshal([]byte(sliceJSON(text)), &result); err != nil {
		return nil, fmt.Errorf("OpenAI returned invalid JSON")
	}
	return result, nil
}

func extractOutputText(payload map[string]any) string {
	if text, ok := payload["output_text"].(string); ok && strings.TrimSpace(text) != "" {
		return strings.TrimSpace(text)
	}
	output, _ := payload["output"].([]any)
	parts := []string{}
	for _, item := range output {
		object, _ := item.(map[string]any)
		contents, _ := object["content"].([]any)
		for _, content := range contents {
			contentObject, _ := content.(map[string]any)
			for _, key := range []string{"text", "output_text", "value"} {
				if text, ok := contentObject[key].(string); ok && strings.TrimSpace(text) != "" {
					parts = append(parts, strings.TrimSpace(text))
				}
			}
		}
	}
	return strings.Join(parts, "\n")
}

func sliceJSON(text string) string {
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start >= 0 && end > start {
		return text[start : end+1]
	}
	return text
}

func mustJSON(value any) string {
	body, _ := json.Marshal(value)
	return string(body)
}

package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type chatCompletionRequest struct {
	Model       string       `json:"model"`
	Messages    []ChatMessage `json:"messages"`
	Temperature float64      `json:"temperature"`
}

type chatCompletionResponse struct {
	Choices []struct {
		Message ChatMessage `json:"message"`
	} `json:"choices"`
}

func (e *ExternalAIProvider) chatCompletion(ctx context.Context, req AssistantRequest) (AssistantResponse, error) {
	messages := []ChatMessage{{
		Role:    "system",
		Content: "You are DeliveryHub's AI assistant. Help with delivery operations, ETA, risk, and drivers. Be concise and do not claim access to live data unless it is included in the supplied context.",
	}}

	history := req.History
	maxMessages := e.maxTurns * 2
	if maxMessages > 0 && len(history) > maxMessages {
		history = history[len(history)-maxMessages:]
	}
	for _, message := range history {
		if (message.Role == "user" || message.Role == "assistant") && strings.TrimSpace(message.Content) != "" {
			messages = append(messages, message)
		}
	}
	question := req.Question
	if len(req.Context) > 0 {
		contextJSON, err := json.Marshal(req.Context)
		if err == nil {
			question += "\n\nDelivery context (JSON): " + string(contextJSON)
		}
	}
	messages = append(messages, ChatMessage{Role: "user", Content: question})

	body, err := json.Marshal(chatCompletionRequest{
		Model: e.model, Messages: messages, Temperature: e.temperature,
	})
	if err != nil {
		return AssistantResponse{}, fmt.Errorf("encode Cerebras request: %w", err)
	}
	endpoint := strings.TrimRight(e.baseURL, "/") + "/chat/completions"
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return AssistantResponse{}, fmt.Errorf("create Cerebras request: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+e.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 60 * time.Second}
	response, err := client.Do(httpReq)
	if err != nil {
		return AssistantResponse{}, fmt.Errorf("call Cerebras API: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return AssistantResponse{}, fmt.Errorf("Cerebras API returned HTTP %d", response.StatusCode)
	}
	var completion chatCompletionResponse
	if err := json.NewDecoder(response.Body).Decode(&completion); err != nil {
		return AssistantResponse{}, fmt.Errorf("decode Cerebras response: %w", err)
	}
	if len(completion.Choices) == 0 || strings.TrimSpace(completion.Choices[0].Message.Content) == "" {
		return AssistantResponse{}, fmt.Errorf("Cerebras API returned no assistant message")
	}
	return AssistantResponse{Answer: completion.Choices[0].Message.Content}, nil
}

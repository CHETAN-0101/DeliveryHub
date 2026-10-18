package config

import (
	"github.com/swaggo/swag"
)

// SwaggerInfo holds the Swagger documentation metadata
var SwaggerInfo = &swag.Spec{
	InfoInstanceName: "swagger",
	SwaggerTemplate: `{
  "swagger": "2.0",
  "info": {
    "title": "DeliveryHub API Gateway",
    "version": "1.0.0",
    "description": "API Gateway for DeliveryHub microservices"
  },
  "host": "localhost:8080",
  "basePath": "/api/v1",
  "schemes": ["http"],
  "securityDefinitions": {
    "Bearer": {
      "type": "apiKey",
      "name": "Authorization",
      "in": "header",
      "description": "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\""
    }
  },
  "security": [
    {
      "Bearer": []
    }
  ]
}`,
	LeftDelim:  "{{",
	RightDelim: "}}",
}
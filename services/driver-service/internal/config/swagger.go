package config

import (
	"github.com/swaggo/swag"
)

var SwaggerInfo = &swag.Spec{
	InfoInstanceName: "swagger",
	SwaggerTemplate: `{
  "swagger": "2.0",
  "info": {
    "title": "DeliveryHub Driver Service",
    "version": "1.0.0",
    "description": "Driver management service for DeliveryHub"
  },
  "host": "localhost:8082",
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
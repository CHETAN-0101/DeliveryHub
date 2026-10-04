package model

import "testing"

func TestDriverStatus_IsValid(t *testing.T) {
	tests := []struct {
		status   DriverStatus
		expected bool
	}{
		{DriverStatusOffline, true},
		{DriverStatusAvailable, true},
		{DriverStatusReserved, true},
		{DriverStatusBusy, true},
		{"INVALID", false},
		{"", false},
	}

	for _, tt := range tests {
		result := tt.status.IsValid()
		if result != tt.expected {
			t.Errorf("DriverStatus(%q).IsValid() = %v, want %v", tt.status, result, tt.expected)
		}
	}
}

func TestDriverStatus_CanTransitionTo(t *testing.T) {
	tests := []struct {
		from     DriverStatus
		to       DriverStatus
		expected bool
	}{
		{DriverStatusOffline, DriverStatusAvailable, true},
		{DriverStatusOffline, DriverStatusReserved, false},
		{DriverStatusOffline, DriverStatusBusy, false},
		{DriverStatusOffline, DriverStatusOffline, false},

		{DriverStatusAvailable, DriverStatusReserved, true},
		{DriverStatusAvailable, DriverStatusBusy, true},
		{DriverStatusAvailable, DriverStatusOffline, true},
		{DriverStatusAvailable, DriverStatusAvailable, false},

		{DriverStatusReserved, DriverStatusBusy, true},
		{DriverStatusReserved, DriverStatusAvailable, true},
		{DriverStatusReserved, DriverStatusOffline, false},
		{DriverStatusReserved, DriverStatusReserved, false},

		{DriverStatusBusy, DriverStatusAvailable, true},
		{DriverStatusBusy, DriverStatusOffline, true},
		{DriverStatusBusy, DriverStatusReserved, false},
		{DriverStatusBusy, DriverStatusBusy, false},
	}

	for _, tt := range tests {
		result := tt.from.CanTransitionTo(tt.to)
		if result != tt.expected {
			t.Errorf("DriverStatus(%q).CanTransitionTo(%q) = %v, want %v", tt.from, tt.to, result, tt.expected)
		}
	}
}
import { beforeEach, describe, expect, it, vi } from "vitest";

import "../evohome-cards.js";

function isoInMinutes(minutesFromNow) {
  return new Date(Date.now() + minutesFromNow * 60000).toISOString();
}

function makeState(overrides = {}) {
  return {
    state: "on",
    attributes: {
      friendly_name: "Domestic Hot Water",
      current_temperature: 56,
      operation_list: ["auto", "on", "off"],
      operation_mode: "auto",
      status: {
        activeFaults: [],
        setpoints: {
          this_sp_from: isoInMinutes(-20),
          this_sp_state: "On",
          next_sp_from: isoInMinutes(480),
          next_sp_state: "Off",
        },
        state_status: {
          state: "On",
          mode: "FollowSchedule",
        },
        temperature_status: {
          temperature: 56,
          is_available: true,
        },
      },
    },
    ...overrides,
  };
}

function makeHass(state) {
  return {
    states: {
      "water_heater.domestic_hot_water": state,
    },
    callService: vi.fn().mockResolvedValue(undefined),
  };
}

function createCard(state, config = { entity: "water_heater.domestic_hot_water" }) {
  const card = document.createElement("evohome-hot-water-card");
  card.setConfig(config);
  if (state) card.hass = makeHass(state);
  return card;
}

describe("evohome-hot-water-card", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders the hot water status and schedule", () => {
    const card = createCard(makeState());

    expect(card.shadowRoot.innerHTML).toContain("Domestic Hot Water");
    expect(card.shadowRoot.innerHTML).toContain("FollowSchedule");
    expect(card.shadowRoot.innerHTML).toContain("On");
    expect(card.shadowRoot.innerHTML).toContain("Off");
    expect(card.shadowRoot.innerHTML).toContain(" since ");
  });

  it("prefers actual entity state and shows current schedule as since", () => {
    const card = createCard(
      makeState({
        state: "off",
        attributes: {
          ...makeState().attributes,
          status: {
            ...makeState().attributes.status,
            setpoints: {
              ...makeState().attributes.status.setpoints,
              this_sp_state: "Off",
            },
            state_status: {
              state: "On",
              mode: "FollowSchedule",
            },
          },
        },
      })
    );

    const stateEl = card.shadowRoot.querySelector(".state");
    expect(stateEl).not.toBeNull();
    expect(stateEl.textContent).toBe("Off (Auto)");
    expect(card.shadowRoot.innerHTML).toContain("Now</div><div class=\"v\">Off since ");
  });

  it("shows override label variants in top-right status", () => {
    const onOverride = createCard(
      makeState({
        state: "on",
        attributes: {
          ...makeState().attributes,
          operation_mode: "on",
        },
      })
    );
    expect(onOverride.shadowRoot.querySelector(".state").textContent).toBe("On (Override)");

    const offOverride = createCard(
      makeState({
        state: "off",
        attributes: {
          ...makeState().attributes,
          operation_mode: "off",
        },
      })
    );
    expect(offOverride.shadowRoot.querySelector(".state").textContent).toBe("Off (Override)");

    const offUnknown = createCard(
      makeState({
        state: "unknown",
        attributes: {
          ...makeState().attributes,
          status: {
            ...makeState().attributes.status,
            setpoints: {
              ...makeState().attributes.status.setpoints,
              this_sp_state: "unknown",
            },
            state_status: {
              state: "unknown",
              mode: "FollowSchedule",
            },
          },
        },
      })
    );
    expect(offUnknown.shadowRoot.querySelector(".state").textContent).toBe("Off");
  });

  it("uses schedule current setpoint state when entity state is auto", () => {
    const autoButOff = createCard(
      makeState({
        state: "auto",
        attributes: {
          ...makeState().attributes,
          status: {
            ...makeState().attributes.status,
            setpoints: {
              ...makeState().attributes.status.setpoints,
              this_sp_state: "Off",
            },
            state_status: {
              state: "On",
              mode: "FollowSchedule",
            },
          },
        },
      })
    );

    const stateEl = autoButOff.shadowRoot.querySelector(".state");
    expect(stateEl.textContent).toBe("Off (Auto)");
  });

  it("uses state_status for non-auto mode when entity state is auto", () => {
    const autoEntityButOverrideOn = createCard(
      makeState({
        state: "auto",
        attributes: {
          ...makeState().attributes,
          operation_mode: "on",
          status: {
            ...makeState().attributes.status,
            setpoints: {
              ...makeState().attributes.status.setpoints,
              this_sp_state: "Off",
            },
            state_status: { state: "On", mode: "PermanentOverride" },
          },
        },
      })
    );

    expect(autoEntityButOverrideOn.shadowRoot.querySelector(".state").textContent).toBe("On (Override)");
  });

  it("validates required entity in config", () => {
    const card = document.createElement("evohome-hot-water-card");
    expect(() => card.setConfig({})).toThrow();
  });

  it("stages mode changes until apply is pressed", async () => {
    const card = createCard(makeState());
    const onButton = Array.from(card.shadowRoot.querySelectorAll(".mode-btn")).find((button) => button.dataset.mode === "on");

    expect(onButton).toBeDefined();
    onButton.click();
    expect(card._hass.callService).not.toHaveBeenCalled();

    const applyBtn = card.shadowRoot.getElementById("apply-btn");
    expect(applyBtn).not.toBeNull();
    applyBtn.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(card._hass.callService).toHaveBeenCalledWith("water_heater", "set_operation_mode", {
      entity_id: "water_heater.domestic_hot_water",
      operation_mode: "on",
    });
  });

  it("applies duration change for already-selected override mode", async () => {
    vi.useFakeTimers();
    try {
      const card = createCard(
        makeState({
          attributes: {
            ...makeState().attributes,
            operation_mode: "on",
          },
        })
      );

      const twoHourBtn = Array.from(card.shadowRoot.querySelectorAll(".dur-btn")).find((button) => button.dataset.mins === "120");
      expect(twoHourBtn).toBeDefined();
      twoHourBtn.click();

      const applyBtn = card.shadowRoot.getElementById("apply-btn");
      expect(applyBtn).not.toBeNull();
      applyBtn.click();
      await Promise.resolve();
      await Promise.resolve();

      expect(card._hass.callService).toHaveBeenCalledWith("water_heater", "set_operation_mode", {
        entity_id: "water_heater.domestic_hot_water",
        operation_mode: "on",
      });

      vi.advanceTimersByTime(120 * 60000);
      await vi.runAllTimersAsync();

      expect(card._hass.callService).toHaveBeenCalledWith("water_heater", "set_operation_mode", {
        entity_id: "water_heater.domestic_hot_water",
        operation_mode: "auto",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses selected duration and resets to auto", async () => {
    vi.useFakeTimers();
    try {
      const card = createCard(makeState());
      card._setDuration(30);
      await card._setOperationMode("off");
      await Promise.resolve();

      expect(card._hass.callService).toHaveBeenCalledWith("water_heater", "set_operation_mode", {
        entity_id: "water_heater.domestic_hot_water",
        operation_mode: "off",
      });

      vi.advanceTimersByTime(30 * 60000);
      await vi.runAllTimersAsync();
      await Promise.resolve();

      expect(card._hass.callService).toHaveBeenCalledWith("water_heater", "set_operation_mode", {
        entity_id: "water_heater.domestic_hot_water",
        operation_mode: "auto",
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("reapplies override 1 minute after next setpoint when duration extends beyond it", async () => {
    vi.useFakeTimers();
    try {
      const card = createCard(
        makeState({
          attributes: {
            ...makeState().attributes,
            status: {
              ...makeState().attributes.status,
              setpoints: {
                ...makeState().attributes.status.setpoints,
                next_sp_from: isoInMinutes(2),
              },
            },
          },
        })
      );

      card._setDuration(20);
      await card._setOperationMode("on");
      await Promise.resolve();

      expect(card._hass.callService).toHaveBeenCalledWith("water_heater", "set_operation_mode", {
        entity_id: "water_heater.domestic_hot_water",
        operation_mode: "on",
      });

      vi.advanceTimersByTime(21 * 60000);
      await vi.runAllTimersAsync();

      const calls = card._hass.callService.mock.calls
        .filter((call) => call[0] === "water_heater" && call[1] === "set_operation_mode")
        .map((call) => call[2].operation_mode);

      expect(calls).toContain("on");
      expect(calls.filter((mode) => mode === "on").length).toBeGreaterThan(1);
      expect(calls).toContain("auto");
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows missing entity message when entity is not found", () => {
    const card = document.createElement("evohome-hot-water-card");
    card.setConfig({ entity: "water_heater.domestic_hot_water" });
    card.hass = { states: {}, callService: vi.fn() };

    expect(card.shadowRoot.innerHTML).toContain("Entity not found: water_heater.domestic_hot_water");
  });

  it("clears loading state when service call fails", async () => {
    const consoleErr = vi.spyOn(console, "error").mockImplementation(() => {});
    const card = createCard(makeState());
    card._hass.callService = vi.fn().mockRejectedValue(new Error("boom"));

    await card._setOperationMode("off");
    await Promise.resolve();

    expect(card._loading).toBe(false);
    consoleErr.mockRestore();
  });

  it("keeps loading until hass reflects the expected operation mode", async () => {
    const card = createCard(makeState());
    await card._setOperationMode("on");
    expect(card._loading).toBe(true);

    const nextState = makeState({
      state: "on",
      attributes: {
        ...makeState().attributes,
        operation_mode: "on",
      },
    });
    card.hass = makeHass(nextState);
    expect(card._loading).toBe(false);
  });
});

/* Copyright 2025 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ColorConverter } from "../../src/core/color_converter.js";

describe("color_converter", function () {
  describe("ColorConverter configuration", function () {
    beforeEach(function () {
      // Reset to default configuration before each test
      ColorConverter.setColorFilterConfig({
        enabled: true,
        colors: {
          Cyan: true,
          Magenta: true,
          Yellow: true,
          Black: true,
        },
      });
    });

    it("should get default configuration", function () {
      const config = ColorConverter.getColorFilterConfig();
      expect(config).toEqual({
        enabled: true,
        colors: {
          Cyan: true,
          Magenta: true,
          Yellow: true,
          Black: true,
        },
      });
    });

    it("should set configuration", function () {
      ColorConverter.setColorFilterConfig({
        enabled: false,
        colors: {
          Cyan: false,
          Magenta: true,
          Yellow: false,
          Black: true,
        },
      });
      const config = ColorConverter.getColorFilterConfig();
      expect(config).toEqual({
        enabled: false,
        colors: {
          Cyan: false,
          Magenta: true,
          Yellow: false,
          Black: true,
        },
      });
    });

    it("should update color state", function () {
      ColorConverter.updateColorState("Cyan", false);
      ColorConverter.updateColorState("Magenta", false);
      const config = ColorConverter.getColorFilterConfig();
      expect(config.colors.Cyan).toBeFalsy();
      expect(config.colors.Magenta).toBeFalsy();
      expect(config.colors.Yellow).toBeTruthy();
      expect(config.colors.Black).toBeTruthy();
    });

    it("should add spot color", function () {
      ColorConverter.addSpotColor("Gold", true);
      ColorConverter.addSpotColor("Silver", false);
      const config = ColorConverter.getColorFilterConfig();
      expect(config.colors.Gold).toBeTruthy();
      expect(config.colors.Silver).toBeFalsy();
    });
  });

  describe("ColorConverter filter methods", function () {
    beforeEach(function () {
      // Reset to default configuration before each test
      ColorConverter.setColorFilterConfig({
        enabled: true,
        colors: {
          Cyan: true,
          Magenta: true,
          Yellow: true,
          Black: true,
          Gold: true,
          Silver: false,
        },
      });
    });

    it("should filter CMYK when enabled", function () {
      const cmyk = [0.5, 0.5, 0.5, 0.5];
      
      // All colors enabled
      let filtered = ColorConverter.filterCMYK(cmyk);
      expect(filtered).toEqual([0.5, 0.5, 0.5, 0.5]);
      
      // Disable Cyan
      ColorConverter.updateColorState("Cyan", false);
      filtered = ColorConverter.filterCMYK(cmyk);
      expect(filtered).toEqual([0, 0.5, 0.5, 0.5]);
      
      // Disable Magenta
      ColorConverter.updateColorState("Magenta", false);
      filtered = ColorConverter.filterCMYK(cmyk);
      expect(filtered).toEqual([0, 0, 0.5, 0.5]);
      
      // Disable Yellow
      ColorConverter.updateColorState("Yellow", false);
      filtered = ColorConverter.filterCMYK(cmyk);
      expect(filtered).toEqual([0, 0, 0, 0.5]);
      
      // Disable Black
      ColorConverter.updateColorState("Black", false);
      filtered = ColorConverter.filterCMYK(cmyk);
      expect(filtered).toEqual([0, 0, 0, 0]);
    });

    it("should not filter CMYK when disabled", function () {
      ColorConverter.setColorFilterConfig({ enabled: false });
      const cmyk = [0.5, 0.5, 0.5, 0.5];
      const filtered = ColorConverter.filterCMYK(cmyk);
      expect(filtered).toEqual([0.5, 0.5, 0.5, 0.5]);
    });

    it("should filter spot colors", function () {
      // Gold is enabled, Silver is disabled
      expect(ColorConverter.filterSpot("Gold", 0.8)).toBe(0.8);
      expect(ColorConverter.filterSpot("Silver", 0.8)).toBe(0);
      expect(ColorConverter.filterSpot("UnknownSpot", 0.8)).toBe(0.8);
    });

    it("should not filter spot colors when disabled", function () {
      ColorConverter.setColorFilterConfig({ enabled: false });
      expect(ColorConverter.filterSpot("Gold", 0.8)).toBe(0.8);
      expect(ColorConverter.filterSpot("Silver", 0.8)).toBe(0.8);
    });
  });

  describe("ColorConverter conversion methods", function () {
    beforeEach(function () {
      // Reset to default configuration before each test
      ColorConverter.setColorFilterConfig({
        enabled: true,
        colors: {
          Cyan: true,
          Magenta: true,
          Yellow: true,
          Black: true,
        },
      });
    });

    it("should convert CMYK to RGB without filter", function () {
      // Full black
      expect(ColorConverter.cmykToRgb([0, 0, 0, 1])).toEqual([0, 0, 0]);
      // Full white
      expect(ColorConverter.cmykToRgb([0, 0, 0, 0])).toEqual([255, 255, 255]);
      // Pure cyan
      expect(ColorConverter.cmykToRgb([1, 0, 0, 0])).toEqual([0, 255, 255]);
      // Pure magenta
      expect(ColorConverter.cmykToRgb([0, 1, 0, 0])).toEqual([255, 0, 255]);
      // Pure yellow
      expect(ColorConverter.cmykToRgb([0, 0, 1, 0])).toEqual([255, 255, 0]);
    });

    it("should convert CMYK to RGB with filter", function () {
      // Disable cyan
      ColorConverter.updateColorState("Cyan", false);
      // Pure cyan should be white when filtered
      expect(ColorConverter.cmykToRgbWithFilter([1, 0, 0, 0])).toEqual([255, 255, 255]);
      
      // Disable magenta
      ColorConverter.updateColorState("Magenta", false);
      // Pure magenta should be white when filtered
      expect(ColorConverter.cmykToRgbWithFilter([0, 1, 0, 0])).toEqual([255, 255, 255]);
      
      // Disable yellow
      ColorConverter.updateColorState("Yellow", false);
      // Pure yellow should be white when filtered
      expect(ColorConverter.cmykToRgbWithFilter([0, 0, 1, 0])).toEqual([255, 255, 255]);
    });

    it("should convert DeviceN to RGB with filter", function () {
      // Add spot colors
      ColorConverter.addSpotColor("Spot1", true);
      ColorConverter.addSpotColor("Spot2", false);
      
      const channels = {
        cmyk: [0.5, 0.5, 0.5, 0.5],
        spots: {
          Spot1: 0.8,
          Spot2: 0.8,
        },
      };
      
      // With filter enabled
      const result1 = ColorConverter.deviceNToRgbWithFilter(channels);
      expect(result1).toBeInstanceOf(Array);
      expect(result1.length).toBe(3);
      
      // With filter disabled
      ColorConverter.setColorFilterConfig({ enabled: false });
      const result2 = ColorConverter.deviceNToRgbWithFilter(channels);
      expect(result2).toBeInstanceOf(Array);
      expect(result2.length).toBe(3);
      expect(result1).not.toEqual(result2);
    });

    it("should automatically register spot colors at runtime", function () {
      // Reset configuration to default
      ColorConverter.setColorFilterConfig({
        enabled: true,
        colors: {
          Cyan: true,
          Magenta: true,
          Yellow: true,
          Black: true,
        },
      });
      
      // Initial config should only have CMYK colors
      let config = ColorConverter.getColorFilterConfig();
      expect(Object.keys(config.colors)).toEqual(["Cyan", "Magenta", "Yellow", "Black"]);
      
      // Call deviceNToRgbWithFilter with new spot colors
      const channels = {
        cmyk: [0.5, 0.5, 0.5, 0.5],
        spots: {
          Gold: 0.8,
          Silver: 0.5,
        },
      };
      
      ColorConverter.deviceNToRgbWithFilter(channels);
      
      // Check if spot colors were automatically registered
      config = ColorConverter.getColorFilterConfig();
      expect(config.colors.Gold).toBeTruthy();
      expect(config.colors.Silver).toBeTruthy();
      expect(Object.keys(config.colors)).toEqual(["Cyan", "Magenta", "Yellow", "Black", "Gold", "Silver"]);
      
      // Call again with same spot colors - should not duplicate
      ColorConverter.deviceNToRgbWithFilter(channels);
      
      config = ColorConverter.getColorFilterConfig();
      expect(Object.keys(config.colors)).toEqual(["Cyan", "Magenta", "Yellow", "Black", "Gold", "Silver"]);
    });
  });
});

/**
 * Copyright (c) OpenLens Maintainers. All rights reserved.
 * Licensed under MIT License. See LICENSE in root directory for more information.
 */

import { describeRolloutError, getRolloutErrorCauses } from "./errors";

describe("rollout error sanitization", () => {
  it("keeps validation fields but never surfaces server-supplied cause text", () => {
    const error = {
      error: {
        code: 422,
        message: "Rejected token: super-secret-value",
        details: { causes: [{ field: "spec.template", message: "Rejected token: super-secret-value" }] },
      },
    };

    expect(describeRolloutError(error)).toBe("The API server rejected the rollback patch.");
    expect(getRolloutErrorCauses(error)).toEqual([{ field: "spec.template", message: "Validation failed." }]);
    expect(JSON.stringify(getRolloutErrorCauses(error))).not.toContain("super-secret-value");
  });
});

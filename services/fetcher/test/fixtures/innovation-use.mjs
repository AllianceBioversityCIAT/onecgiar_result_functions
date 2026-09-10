/**
 * A minimal Innovation Use row that satisfies both the schema and the minimum data set.
 *
 * Every test starts from a payload that passes and takes exactly one thing away, so a failure
 * names the rule under test rather than whatever else happened to be missing. Returns a fresh
 * object each call — the tests mutate it in place.
 */
export function validInnovationUse() {
  return {
    created_date: "2026-02-11T09:00:00Z",
    created_by: { email: "innovation.team@cgiar.org", name: "Innovation Analyst" },
    lead_contact_person: {
      email: "innovation.team@cgiar.org",
      name: "Innovation Analyst",
    },
    lead_center: { acronym: "ICARDA" },
    title: "Adoption of climate-resilient seed varieties",
    description: "Tracking use of climate-resilient seed varieties among smallholders.",
    toc_mapping: { science_program_id: "SP06" },
    geo_focus: { scope_code: 1, scope_label: "Global" },
    contributing_bilateral_projects: [
      { grant_title: "Seed Adoption Initiative", usd_budget: 250000 },
    ],
    innovation_use: {
      innovation_use_level: { level: 2, name: "Scaling" },
      current_innovation_use_numbers: {
        innov_use_to_be_determined: false,
        actors: [{ actor_type_id: 1, sex_and_age_disaggregation: false, how_many: 40 }],
        measures: [{ unit_of_measure: "# of Innovations", quantity: 2 }],
      },
    },
  };
}

/** The row as it arrives on the wire, wrapped the way `/ingest` reads a batch entry. */
export function innovationUseRow(data) {
  return { type: "innovation_use", data };
}

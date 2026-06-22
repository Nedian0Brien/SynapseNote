Feature: Mocked login flows
  Completed GoTrue sign-in methods should use the same SynapseNote auth completion flow.

  Scenario Outline: Sign in with a mocked provider
    Given mocked SynapseNote auth APIs are configured for "<method>" sign in
    When I complete "<method>" sign in
    Then I am redirected to the app
    And the saved auth token is the refreshed token for "<method>" sign in

    Examples:
      | method         |
      | password       |
      | email OTP      |
      | OAuth callback |

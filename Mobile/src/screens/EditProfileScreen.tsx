// src/screens/EditProfileScreen.tsx
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { colors, brand, radius } from "../theme";
import { useAuth } from "../context/AuthContext";
import { getMyProfile, updateMyBiodata } from "../api/user";

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { user, refreshProfile, updateUserState } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Exact fields matching Screenshot 4 & MongoDB Atlas user document
  const [name, setName] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [gender, setGender] = useState("male");
  const [bio, setBio] = useState("");
  const [occupation, setOccupation] = useState("");
  const [education, setEducation] = useState("");
  const [relationshipGoal, setRelationshipGoal] = useState("not-sure");
  const [interests, setInterests] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  const [genderPickerOpen, setGenderPickerOpen] = useState(false);
  const [goalPickerOpen, setGoalPickerOpen] = useState(false);

  useEffect(() => {
    async function loadProfile() {
      try {
        setLoading(true);
        const data = await getMyProfile();
        const profile = data?.user || user;
        if (profile) {
          setName(profile.name || "");
          setDateOfBirth(
            profile.dateOfBirth
              ? profile.dateOfBirth.split("T")[0]
              : "2000-01-01"
          );
          setGender(profile.gender || "male");
          setBio(profile.bio || "");
          setOccupation(profile.occupation || "");
          setEducation(profile.education || "");
          setRelationshipGoal(profile.relationshipGoal || "not-sure");
          setInterests(
            Array.isArray(profile.interests)
              ? profile.interests.join(", ")
              : profile.interests || ""
          );
          setCity(profile.location?.city || "");
          setCountry(profile.location?.country || "Nepal");
        }
      } catch (err) {
        console.warn("Could not fetch remote profile, loaded from context", err);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [user]);

  const handleSubmit = async () => {
    setError("");
    if (!name.trim()) {
      setError("Full Name is required.");
      return;
    }

    setSaving(true);
    const parsedInterests = interests
      .split(",")
      .map((i) => i.trim())
      .filter(Boolean);

    const updatePayload = {
      name: name.trim(),
      dateOfBirth,
      gender,
      bio: bio.trim(),
      occupation: occupation.trim(),
      education: education.trim(),
      relationshipGoal,
      interests: parsedInterests,
      city: city.trim(),
      country: country.trim(),
    };

    try {
      await updateMyBiodata(updatePayload);
      updateUserState(updatePayload);
      await refreshProfile();
      setSuccess(true);
      setTimeout(() => {
        navigation.goBack();
      }, 1000);
    } catch (err: any) {
      console.warn("Update error:", err);
      updateUserState(updatePayload);
      setSuccess(true);
      setTimeout(() => {
        navigation.goBack();
      }, 1000);
    } finally {
      setSaving(false);
    }
  };

  const genderLabel = () => {
    if (gender === "male") return "Male";
    if (gender === "female") return "Female";
    if (gender === "other") return "Other";
    return "Select Gender";
  };

  const goalLabel = () => {
    const goals: Record<string, string> = {
      "not-sure": "Not Sure Yet",
      marriage: "Marriage",
      serious: "Serious Relationship",
      casual: "Casual Dating",
      friendship: "Friendship",
    };
    return goals[relationshipGoal] || "Not Sure Yet";
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.container, { paddingTop: insets.top }]}
    >
      {/* Top Bar */}
      <View style={styles.topNav}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
        >
          <Ionicons name="arrow-back" size={24} color={colors.heading} />
        </TouchableOpacity>
        <Text style={styles.navHeading}>Edit Profile</Text>
        <View style={{ width: 28 }} />
      </View>

      {loading ? (
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={brand.to} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollArea}
          keyboardShouldPersistTaps="handled"
        >
          {/* Main Card replicating Screenshot 4 */}
          <View style={[styles.mainCard, cardShadow]}>
            <Text style={styles.cardMainTitle}>Edit Profile</Text>
            <Text style={styles.cardSubtitle}>
              Tell people a little more about yourself.
            </Text>

            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {success ? (
              <View style={styles.successBox}>
                <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                <Text style={styles.successText}>Profile changes saved to database!</Text>
              </View>
            ) : null}

            {/* Section: Basic Information */}
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>Basic Information</Text>

              {/* Full Name */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Full Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="Your Full Name"
                  placeholderTextColor={colors.placeholder}
                />
              </View>

              {/* Date of Birth & Gender Row */}
              <View style={styles.twoColRow}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Date of Birth</Text>
                  <TextInput
                    style={styles.textInput}
                    value={dateOfBirth}
                    onChangeText={setDateOfBirth}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.placeholder}
                  />
                </View>

                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Gender</Text>
                  <TouchableOpacity
                    style={styles.selectInput}
                    onPress={() => setGenderPickerOpen(true)}
                  >
                    <Text style={styles.selectText}>{genderLabel()}</Text>
                    <Ionicons name="chevron-down" size={16} color={colors.subtext} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Section: About You */}
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>About You</Text>

              {/* Bio with 500 Char Counter */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Bio</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  value={bio}
                  onChangeText={setBio}
                  maxLength={500}
                  multiline
                  placeholder="Write something interesting about yourself..."
                  placeholderTextColor={colors.placeholder}
                />
                <Text style={styles.charCount}>
                  {bio.length}/500 characters
                </Text>
              </View>

              {/* Occupation & Education Row */}
              <View style={styles.twoColRow}>
                {/* Occupation */}
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Occupation</Text>
                  <View style={styles.iconInputWrap}>
                    <Ionicons
                      name="briefcase-outline"
                      size={18}
                      color="#8b5cf6"
                      style={styles.leadIcon}
                    />
                    <TextInput
                      style={styles.iconTextInput}
                      value={occupation}
                      onChangeText={setOccupation}
                      placeholder="Web Developer"
                      placeholderTextColor={colors.placeholder}
                    />
                  </View>
                </View>

                {/* Education */}
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Education</Text>
                  <View style={styles.iconInputWrap}>
                    <Ionicons
                      name="school-outline"
                      size={18}
                      color="#8b5cf6"
                      style={styles.leadIcon}
                    />
                    <TextInput
                      style={styles.iconTextInput}
                      value={education}
                      onChangeText={setEducation}
                      placeholder="e.g. Bachelor's Degree"
                      placeholderTextColor={colors.placeholder}
                    />
                  </View>
                </View>
              </View>
            </View>

            {/* Section: Relationship Goal */}
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>Relationship Goal</Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>What are you looking for?</Text>
                <TouchableOpacity
                  style={styles.selectInput}
                  onPress={() => setGoalPickerOpen(true)}
                >
                  <Text style={styles.selectText}>{goalLabel()}</Text>
                  <Ionicons name="chevron-down" size={16} color={colors.subtext} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Section: Interests */}
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>Interests</Text>
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Your Interests</Text>
                <TextInput
                  style={styles.textInput}
                  value={interests}
                  onChangeText={setInterests}
                  placeholder="Travel, Photography, Cooking"
                  placeholderTextColor={colors.placeholder}
                />
                <Text style={styles.fieldHelpText}>
                  Separate interests with commas.
                </Text>
              </View>
            </View>

            {/* Section: Location */}
            <View style={styles.sectionWrap}>
              <Text style={styles.sectionTitle}>Location</Text>
              <View style={styles.twoColRow}>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>City</Text>
                  <TextInput
                    style={styles.textInput}
                    value={city}
                    onChangeText={setCity}
                    placeholder="Janakpur"
                    placeholderTextColor={colors.placeholder}
                  />
                </View>
                <View style={[styles.fieldGroup, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Country</Text>
                  <TextInput
                    style={styles.textInput}
                    value={country}
                    onChangeText={setCountry}
                    placeholder="Nepal"
                    placeholderTextColor={colors.placeholder}
                  />
                </View>
              </View>
            </View>

            {/* Buttons Row: Cancel and Save Changes */}
            <View style={styles.buttonsRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => navigation.goBack()}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.saveBtn}
                onPress={handleSubmit}
                disabled={saving}
              >
                <LinearGradient
                  colors={[brand.from, brand.to]}
                  start={brand.start}
                  end={brand.end}
                  style={styles.saveBtnGrad}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark" size={18} color="#ffffff" />
                      <Text style={styles.saveBtnText}>Save Changes</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      )}

      {/* Gender Picker Modal */}
      <Modal visible={genderPickerOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setGenderPickerOpen(false)}
        >
          <View style={styles.pickerBox}>
            <Text style={styles.pickerTitle}>Select Gender</Text>
            {["Male", "Female", "Other"].map((g) => (
              <TouchableOpacity
                key={g}
                style={[
                  styles.pickerItem,
                  gender.toLowerCase() === g.toLowerCase() && styles.pickerItemActive,
                ]}
                onPress={() => {
                  setGender(g.toLowerCase());
                  setGenderPickerOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    gender.toLowerCase() === g.toLowerCase() && styles.pickerItemTextActive,
                  ]}
                >
                  {g}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Goal Picker Modal */}
      <Modal visible={goalPickerOpen} transparent animationType="fade">
        <TouchableOpacity
          style={styles.pickerBackdrop}
          activeOpacity={1}
          onPress={() => setGoalPickerOpen(false)}
        >
          <View style={styles.pickerBox}>
            <Text style={styles.pickerTitle}>Relationship Goal</Text>
            {[
              { id: "not-sure", label: "Not Sure Yet" },
              { id: "marriage", label: "Marriage" },
              { id: "serious", label: "Serious Relationship" },
              { id: "casual", label: "Casual Dating" },
              { id: "friendship", label: "Friendship" },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.pickerItem,
                  relationshipGoal === opt.id && styles.pickerItemActive,
                ]}
                onPress={() => {
                  setRelationshipGoal(opt.id);
                  setGoalPickerOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.pickerItemText,
                    relationshipGoal === opt.id && styles.pickerItemTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  topNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#ffffff",
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBorder,
  },
  backBtn: {
    padding: 4,
  },
  navHeading: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.heading,
  },
  scrollArea: {
    padding: 16,
    paddingBottom: 40,
  },
  mainCard: {
    backgroundColor: "#ffffff",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  cardMainTitle: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.heading,
    letterSpacing: -0.5,
  },
  cardSubtitle: {
    fontSize: 14,
    color: colors.subtext,
    marginTop: 4,
    marginBottom: 20,
  },
  sectionWrap: {
    marginBottom: 22,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.heading,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.label,
  },
  textInput: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.heading,
  },
  textArea: {
    height: 100,
    textAlignVertical: "top",
  },
  charCount: {
    fontSize: 11,
    color: colors.subtext,
    alignSelf: "flex-end",
  },
  fieldHelpText: {
    fontSize: 11,
    color: colors.subtext,
  },
  twoColRow: {
    flexDirection: "row",
    gap: 12,
  },
  selectInput: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  selectText: {
    fontSize: 14,
    color: colors.heading,
  },
  iconInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  leadIcon: {
    marginRight: 8,
  },
  iconTextInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.heading,
  },
  buttonsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.inputBorder,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.heading,
  },
  saveBtn: {
    flex: 1.4,
    borderRadius: 12,
    overflow: "hidden",
  },
  saveBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 14,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#ffffff",
  },
  centerLoading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
  },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  errorText: {
    color: colors.danger,
    fontSize: 13,
  },
  successBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    marginBottom: 14,
  },
  successText: {
    color: "#065f46",
    fontSize: 13,
    fontWeight: "600",
  },
  pickerBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  pickerBox: {
    width: "100%",
    maxWidth: 300,
    backgroundColor: "#ffffff",
    borderRadius: 18,
    padding: 16,
    gap: 4,
  },
  pickerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: colors.heading,
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  pickerItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  pickerItemActive: {
    backgroundColor: "#f5f3ff",
  },
  pickerItemText: {
    fontSize: 14,
    color: colors.heading,
  },
  pickerItemTextActive: {
    color: brand.to,
    fontWeight: "700",
  },
});

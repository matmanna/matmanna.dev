#!/usr/bin/env ruby

require 'set'
require 'pathname'

ROOT = File.expand_path('..', __dir__)
SPRITE_PATH = File.join(ROOT, 'assets', 'icons', 'fa-sprite.svg')

STYLE_TOKENS = %w[fa-solid fa-regular fa-brands fas far fab].freeze


def extract_frontmatter(content)
  match = content.match(/\A---\s*\n(.*?)\n---\s*(?:\n|\z)/m)
  match && match[1]
end


def normalize_icon(raw)
  value = raw.to_s.strip
  value = value[1..-2] if (value.start_with?("'") && value.end_with?("'")) || (value.start_with?("\"") && value.end_with?("\""))

  tokens = value.split(/\s+/)
  style = 'fa-solid'

  tokens.each do |token|
    case token
    when 'fa-brands', 'fab'
      style = 'fa-brands'
    when 'fa-regular', 'far'
      style = 'fa-regular'
    when 'fa-solid', 'fas'
      style = 'fa-solid'
    end
  end

  name_token = tokens.reverse.find { |token| token.start_with?('fa-') && !STYLE_TOKENS.include?(token) }
  name = name_token ? name_token.sub(/^fa-/, '') : value.sub(/^fa-/, '')

  [style, name, "#{style}-#{name}"]
end


def markdown_files(root)
  patterns = [
    File.join(root, '**', '*.md'),
    File.join(root, '**', '*.markdown')
  ]

  patterns.flat_map { |pattern| Dir.glob(pattern, File::FNM_DOTMATCH) }
          .select { |path| File.file?(path) }
          .reject { |path| path.include?('/_site/') || path.include?('/.git/') || path.include?('/vendor/') || path.include?('/node_modules/') }
          .uniq
end

sprite_ids = File.read(SPRITE_PATH).scan(/<symbol id="([^"]+)"/).flatten.to_set
used_icons = Hash.new { |hash, key| hash[key] = [] }

markdown_files(ROOT).each do |file_path|
  content = File.read(file_path)
  frontmatter = extract_frontmatter(content)
  next unless frontmatter

  frontmatter.each_line.with_index(2) do |line, line_number|
    next unless line.match?(/^\s*icon:\s*/)

    raw_icon = line.sub(/^\s*icon:\s*/, '').strip
    next if raw_icon.empty?

    style, name, sprite_id = normalize_icon(raw_icon)
    relative_path = Pathname.new(file_path).relative_path_from(Pathname.new(ROOT)).to_s
    used_icons[sprite_id] << [relative_path, line_number, raw_icon, style, name]
  end
end

missing = used_icons.keys.reject { |sprite_id| sprite_ids.include?(sprite_id) }.sort

if missing.empty?
  puts 'No missing Font Awesome sprite icons found in markdown frontmatter.'
  exit 0
end

puts 'Missing Font Awesome sprite icons:'
missing.each do |sprite_id|
  puts "- #{sprite_id}"
  used_icons[sprite_id].each do |relative_path, line_number, raw_icon, style, name|
    puts "  - #{relative_path}:#{line_number} -> #{raw_icon} (normalized: #{style}-#{name})"
  end
end

exit 1
